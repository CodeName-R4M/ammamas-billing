import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { ArrowLeft, Download, Printer, Plus, Receipt as ReceiptIcon, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatCurrency, money } from '@/lib/calculations';
import { Watermark } from '@/components/watermark/Watermark';

/** A receipt is read back from the database — the same row every device sees. */
interface CloudReceiptLine {
  product_id: string;
  name: string;
  unit_price: number;
  qty: number;
  line_total: number;
}

interface CloudReceipt {
  id: string;
  receipt_no: string;
  cashier_name: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  payment_method: string;
  payment_status: string;
  created_at: string;
  items: CloudReceiptLine[];
}

export function Receipt() {
  const { saleId } = useParams();
  const nav = useNavigate();
  const settings = useDemoStore((s) => s.settings);

  const [sale, setSale] = useState<CloudReceipt | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!saleId) { setState('missing'); return; }
    let active = true;

    const load = async () => {
      setState('loading');
      if (!isSupabaseConfigured || !supabase) {
        setState('error');
        setError('The cloud server is not configured.');
        return;
      }
      const { data: head, error: headErr } = await supabase
        .from('sales')
        .select('id, receipt_no, cashier_name, subtotal, discount, tax, total, coupon_code, payment_method, payment_status, created_at')
        .eq('id', saleId)
        .maybeSingle();
      if (!active) return;
      if (headErr) { setState('error'); setError(headErr.message); return; }
      if (!head) { setState('missing'); return; }

      const { data: lines, error: lineErr } = await supabase
        .from('sale_items')
        .select('product_id, name, unit_price, qty, line_total')
        .eq('sale_id', saleId);
      if (!active) return;
      if (lineErr) { setState('error'); setError(lineErr.message); return; }

      setSale({ ...(head as CloudReceipt), items: (lines ?? []) as CloudReceiptLine[] });
      setState('ready');
    };

    void load();
    return () => { active = false; };
  }, [saleId]);

  if (state === 'loading') {
    return (
      <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-10 text-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        <p className="mt-3 text-sm text-neutral-400">Loading receipt from the cloud…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-10 text-center">
        <AlertTriangle size={28} className="mx-auto text-danger-500" />
        <p className="mt-2 text-sm text-danger-600">{error}</p>
        <Link to="/pos" className="mt-3 inline-block text-primary-600">Back to billing</Link>
      </div>
    );
  }

  if (state === 'missing' || !sale) {
    return (
      <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-10 text-center">
        <p className="text-sm text-neutral-400">Receipt not found.</p>
        <Link to="/pos" className="mt-3 inline-block text-primary-600">Back to billing</Link>
      </div>
    );
  }

  const dt = new Date(sale.created_at);
  const paid = sale.payment_status === 'paid';
  const statusBadge = paid
    ? 'bg-success-50 text-success-700'
    : sale.payment_status === 'cancelled'
      ? 'bg-danger-50 text-danger-700'
      : 'bg-warning-50 text-warning-700';

  const downloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 14; const R = 196; let y = 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(settings.business_name, L, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (settings.address) { doc.text(settings.address, L, y); y += 4; }
    if (settings.phone) { doc.text(`Phone: ${settings.phone}`, L, y); y += 4; }
    y += 2;
    doc.setDrawColor(167, 139, 250); doc.setLineWidth(0.5); doc.line(L, y, R, y); y += 6;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', L, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Receipt No: ${sale.receipt_no}`, L, y); doc.text(`Date: ${dt.toLocaleString('en-IN')}`, R, y, { align: 'right' }); y += 4;
    doc.text(`Cashier: ${sale.cashier_name}`, L, y); y += 4;
    doc.text(`Payment: ${sale.payment_method.toUpperCase()} - ${sale.payment_status.toUpperCase()}`, L, y); y += 6;
    doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Item', L, y); doc.text('Qty', 120, y, { align: 'right' }); doc.text('Price', 150, y, { align: 'right' }); doc.text('Total', R, y, { align: 'right' }); y += 5;
    doc.setFont('helvetica', 'normal');
    for (const it of sale.items) {
      doc.text(it.name.slice(0, 40), L, y);
      doc.text(String(it.qty), 120, y, { align: 'right' });
      doc.text(money(it.unit_price), 150, y, { align: 'right' });
      doc.text(money(it.line_total), R, y, { align: 'right' });
      y += 5;
      if (y > 280) { doc.addPage(); y = 16; }
    }
    y += 2; doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 6;
    const right = (label: string, val: string) => { doc.text(label, 150, y, { align: 'right' }); doc.text(val, R, y, { align: 'right' }); y += 5; };
    right('Subtotal:', formatCurrency(sale.subtotal, settings.currency));
    if (sale.discount > 0) right('Discount:', `- ${formatCurrency(sale.discount, settings.currency)}`);
    if (sale.tax > 0) right('Tax:', formatCurrency(sale.tax, settings.currency));
    doc.setFont('helvetica', 'bold'); right('TOTAL:', formatCurrency(sale.total, settings.currency));
    doc.setFont('helvetica', 'normal'); y += 4;
    doc.text('Thank you for shopping with us!', L, y); y += 8;
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text('PROVIDED BY ALPHA DIGITRONIX SOLUTION', L, y);
    doc.save(`${sale.receipt_no}.pdf`);
    toast.success('Receipt PDF downloaded');
  };

  return (
    <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => nav('/pos')} className="btn-ghost rounded-full" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="text-lg font-bold text-neutral-800">Receipt</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <div className="bg-gradient-to-br from-primary-50 to-accent-100 p-5 text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-xl bg-primary-600 text-white"><ReceiptIcon size={22} /></div>
          <h2 className="text-lg font-bold text-neutral-800">{settings.business_name}</h2>
          {settings.address && <p className="text-xs text-neutral-500">{settings.address}</p>}
          {settings.phone && <p className="text-xs text-neutral-500">{settings.phone}</p>}
        </div>
        <div className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-neutral-400">Receipt no.</p><p className="font-semibold text-neutral-700">{sale.receipt_no}</p></div>
            <div><p className="text-neutral-400">Date &amp; time</p><p className="font-semibold text-neutral-700">{dt.toLocaleString('en-IN')}</p></div>
            <div><p className="text-neutral-400">Cashier</p><p className="font-semibold text-neutral-700">{sale.cashier_name}</p></div>
            <div><p className="text-neutral-400">Payment</p><span className={`badge ${statusBadge}`}>{sale.payment_method.toUpperCase()} · {sale.payment_status}</span></div>
          </div>

          <div className="border-t border-neutral-100 pt-3">
            {sale.items.map((it) => (
              <div key={it.product_id} className="flex justify-between py-1.5 text-sm">
                <div>
                  <p className="font-medium text-neutral-800">{it.name}</p>
                  <p className="text-xs text-neutral-400">{it.qty} × {formatCurrency(it.unit_price, settings.currency)}</p>
                </div>
                <span className="font-semibold text-neutral-800">{formatCurrency(it.line_total, settings.currency)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-neutral-100 pt-3">
            <Row label="Subtotal" value={formatCurrency(sale.subtotal, settings.currency)} />
            {sale.discount > 0 && <Row label={`Discount (${sale.coupon_code})`} value={`- ${formatCurrency(sale.discount, settings.currency)}`} accent="success" />}
            {sale.tax > 0 && <Row label="Tax" value={formatCurrency(sale.tax, settings.currency)} />}
            <div className="mt-1 flex justify-between border-t border-neutral-100 pt-2">
              <span className="font-bold text-neutral-800">{paid ? 'Total paid' : 'Amount due'}</span>
              <span className="text-xl font-bold text-primary-700">{formatCurrency(sale.total, settings.currency)}</span>
            </div>
          </div>

          {!paid && (
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700">
              <AlertTriangle size={14} /> This sale is {sale.payment_status} — payment was not recorded.
              <button onClick={() => nav('/pos')} className="ml-1 inline-flex items-center gap-1 underline"><RefreshCw size={12} /> Retry</button>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-neutral-400">Thank you for shopping with us!</p>
          <Watermark />
        </div>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={downloadPdf} className="btn-primary col-span-2 py-3"><Download size={16} /> Download PDF</button>
        <button onClick={() => window.print()} className="btn-secondary py-3"><Printer size={16} /> Print</button>
        <button onClick={() => nav('/pos')} className="btn-secondary py-3"><Plus size={16} /> New bill</button>
      </div>
      <button onClick={() => nav('/pos/history')} className="mt-2 w-full text-center text-sm text-primary-600">View transaction history</button>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'success' }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className={accent === 'success' ? 'font-semibold text-success-600' : 'font-medium text-neutral-700'}>{value}</span>
    </div>
  );
}
