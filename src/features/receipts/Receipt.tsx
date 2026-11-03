import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { Printer as NativePrinter } from '@capgo/capacitor-printer';
import { ArrowLeft, Download, Printer, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatCurrency, money } from '@/lib/calculations';
import { getLogoBase64 } from '@/lib/exportUtils';
import { APP_NAME, WATERMARK_TEXT } from '@/lib/brand';
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

/**
 * Paper sizes for the receipt. Thermal rolls are the default: a 58 mm roll
 * carries ~48 mm of printable width, an 80 mm roll ~70 mm. A4 is kept for
 * offices that print receipts on a normal sheet.
 */
type PaperSize = '58' | '80' | 'a4';
const PAPER_MM: Record<Exclude<PaperSize, 'a4'>, number> = { '58': 58, '80': 80 };

/** Escapes text before it goes into the print window's HTML. */
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(value: unknown): string {
  return String(value).replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

export function Receipt() {
  const { saleId } = useParams();
  const nav = useNavigate();
  const settings = useDemoStore((s) => s.settings);
  const currency = settings.currency;

  const [sale, setSale] = useState<CloudReceipt | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [paper, setPaper] = useState<PaperSize>('58');

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

  /** Full A4 page receipt for office printers. */
  const drawA4Pdf = (doc: jsPDF, logo: string | null) => {
    const L = 14; const R = 196; let y = 16;
    if (logo) {
      doc.addImage(logo, 'PNG', L, y - 5, 20, 20 / 1.39);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(APP_NAME, logo ? L + 24 : L, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (settings.address) { doc.text(settings.address, logo ? L + 24 : L, y); y += 4; }
    if (settings.phone) { doc.text(`Phone: ${settings.phone}`, logo ? L + 24 : L, y); y += 4; }
    y += 2;
    // Brand red divider
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5); doc.line(L, y, R, y); y += 6;
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
    right('Subtotal:', formatCurrency(sale.subtotal, currency));
    if (sale.discount > 0) right('Discount:', `- ${formatCurrency(sale.discount, currency)}`);
    if (sale.tax > 0) right('Tax:', formatCurrency(sale.tax, currency));
    doc.setFont('helvetica', 'bold'); right('TOTAL:', formatCurrency(sale.total, currency));
    doc.setFont('helvetica', 'normal'); y += 4;
    doc.text('Thank you for shopping with us!', L, y); y += 8;
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(WATERMARK_TEXT, L, y);
  };

  /**
   * Thermal-roll receipt. Narrow layout tuned to the roll width: the header and
   * totals are centred, and each item prints its name on its own line(s) with
   * "qty x price" and the line total beneath so nothing is clipped.
   */
  const drawThermalPdf = (doc: jsPDF, logo: string | null, widthMm: number) => {
    // 5 mm each side leaves ~48 mm of printable width on a 58 mm roll.
    const m = 5;
    const cw = widthMm - m * 2;
    const lh = (size: number) => size * 0.42;
    let y = m + 1;

    const center = (txt: string, size: number, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(txt, cw) as string[];
      doc.text(lines, widthMm / 2, y, { align: 'center' });
      y += lines.length * lh(size) + 0.4;
    };

    const kv = (label: string, value: string, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(7);
      doc.text(label, m, y);
      doc.text(value, widthMm - m, y, { align: 'right' });
      y += lh(7) + 0.4;
    };

    const divider = () => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.6, 0.6], 0);
      doc.line(m, y, widthMm - m, y);
      doc.setLineDashPattern([], 0);
      y += 2.4;
    };

    if (logo) {
      const lw = widthMm <= 58 ? 15 : 19;
      doc.addImage(logo, 'PNG', (widthMm - lw) / 2, y, lw, lw / 1.39);
      y += lw / 1.39 + 1.2;
    }

    doc.setTextColor(0, 0, 0);
    center(APP_NAME.toUpperCase(), 12, true);
    if (settings.address) center(settings.address, 6.5);
    if (settings.phone) center(`Phone: ${settings.phone}`, 6.5);
    divider();

    center('RECEIPT', 8, true);
    kv('Receipt No', sale.receipt_no);
    kv('Date', dt.toLocaleString('en-IN'));
    kv('Cashier', sale.cashier_name);
    kv('Payment', `${sale.payment_method.toUpperCase()} · ${sale.payment_status.toUpperCase()}`);
    divider();

    const pageH = doc.internal.pageSize.getHeight();
    for (const it of sale.items) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2);
      const nameLines = doc.splitTextToSize(it.name, cw) as string[];
      doc.text(nameLines, m, y);
      y += nameLines.length * lh(7.2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text(`${it.qty} x ${money(it.unit_price)}`, m, y);
      doc.text(money(it.line_total), widthMm - m, y, { align: 'right' });
      y += lh(7) + 0.8;
      if (y > pageH - 14) { doc.addPage(); y = m; }
    }
    divider();

    kv('Subtotal', formatCurrency(sale.subtotal, currency));
    if (sale.discount > 0) kv('Discount', `- ${formatCurrency(sale.discount, currency)}`);
    if (sale.tax > 0) kv('Tax', formatCurrency(sale.tax, currency));
    kv(paid ? 'TOTAL PAID' : 'AMOUNT DUE', formatCurrency(sale.total, currency), true);
    y += 1.6;
    center('Thank you for shopping with us!', 7);
    doc.setTextColor(130, 130, 130);
    center(WATERMARK_TEXT, 5.5);
  };

  const downloadPdf = async () => {
    const logo = await getLogoBase64();
    if (paper === 'a4') {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      drawA4Pdf(doc, logo);
      doc.save(`${sale.receipt_no}.pdf`);
    } else {
      const widthMm = PAPER_MM[paper];
      // Page height is estimated from the content so the roll PDF is one long strip.
      const extra = (sale.discount > 0 ? 5 : 0) + (sale.tax > 0 ? 5 : 0);
      const pageH = Math.max(120, 82 + sale.items.length * 9 + extra);
      const doc = new jsPDF({ unit: 'mm', format: [widthMm, pageH] });
      drawThermalPdf(doc, logo, widthMm);
      doc.save(`${sale.receipt_no}.pdf`);
    }
    toast.success('Receipt PDF downloaded');
  };

  /**
   * Prints through the device's own print dialog. A WebView cannot run
   * `window.print()` on Android, so the native PrintManager handles it — the
   * plugin renders the receipt off-screen and never takes over the app (the old
   * popup window trapped the cashier on the bill with no way back).
   */
  const printReceipt = async () => {
    if (paper === 'a4') {
      try {
        await NativePrinter.printWebView({ name: sale.receipt_no });
      } catch {
        toast.error('Could not open the print dialog on this device.');
      }
      return;
    }
    const widthMm = PAPER_MM[paper];

    const itemsHtml = sale.items.map((it) => `
      <div class="item">
        <div class="nm">${esc(it.name)}</div>
        <div class="row"><span>${it.qty} x ${esc(money(it.unit_price))}</span><span>${esc(money(it.line_total))}</span></div>
      </div>`).join('');

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(sale.receipt_no)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${widthMm}mm; padding: 3mm; font-family: "Courier New", ui-monospace, monospace; font-size: 11px; line-height: 1.35; color: #000; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .sm { font-size: 9px; }
  .lg { font-size: 15px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-bottom: 3px; }
  .nm { font-weight: 700; }
  .tiny { font-size: 8px; color: #444; }
</style></head>
<body>
  <div class="c b lg">${esc(APP_NAME.toUpperCase())}</div>
  ${settings.address ? `<div class="c sm">${esc(settings.address)}</div>` : ''}
  ${settings.phone ? `<div class="c sm">Phone: ${esc(settings.phone)}</div>` : ''}
  <hr>
  <div class="c b">RECEIPT</div>
  <div class="row"><span>Receipt no</span><span>${esc(sale.receipt_no)}</span></div>
  <div class="row"><span>Date</span><span>${esc(dt.toLocaleString('en-IN'))}</span></div>
  <div class="row"><span>Cashier</span><span>${esc(sale.cashier_name)}</span></div>
  <div class="row"><span>Payment</span><span>${esc(sale.payment_method.toUpperCase())} · ${esc(sale.payment_status)}</span></div>
  <hr>
  ${itemsHtml}
  <hr>
  <div class="row"><span>Subtotal</span><span>${esc(formatCurrency(sale.subtotal, currency))}</span></div>
  ${sale.discount > 0 ? `<div class="row"><span>Discount</span><span>- ${esc(formatCurrency(sale.discount, currency))}</span></div>` : ''}
  ${sale.tax > 0 ? `<div class="row"><span>Tax</span><span>${esc(formatCurrency(sale.tax, currency))}</span></div>` : ''}
  <div class="row b"><span>${paid ? 'TOTAL PAID' : 'AMOUNT DUE'}</span><span>${esc(formatCurrency(sale.total, currency))}</span></div>
  <hr>
  <div class="c">Thank you for shopping with us!</div>
  <div class="c tiny">${esc(WATERMARK_TEXT)}</div>
</body></html>`;

    try {
      await NativePrinter.printHtml({ name: sale.receipt_no, html });
    } catch {
      toast.error('Could not open the print dialog on this device.');
    }
  };

  return (
    <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => nav('/pos')} className="btn-ghost rounded-full" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="text-lg font-bold text-neutral-800">Receipt</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <div className="bg-gradient-to-br from-primary-50 to-accent-100 p-5 text-center">
          <img src="/logo-red.png" alt={APP_NAME} className="mx-auto mb-2 h-12 w-auto object-contain" />
          <h2 className="text-lg font-bold text-neutral-800">{APP_NAME}</h2>
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
                  <p className="text-xs text-neutral-400">{it.qty} × {formatCurrency(it.unit_price, currency)}</p>
                </div>
                <span className="font-semibold text-neutral-800">{formatCurrency(it.line_total, currency)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-neutral-100 pt-3">
            <Row label="Subtotal" value={formatCurrency(sale.subtotal, currency)} />
            {sale.discount > 0 && <Row label={`Discount (${sale.coupon_code})`} value={`- ${formatCurrency(sale.discount, currency)}`} accent="success" />}
            {sale.tax > 0 && <Row label="Tax" value={formatCurrency(sale.tax, currency)} />}
            <div className="mt-1 flex justify-between border-t border-neutral-100 pt-2">
              <span className="font-bold text-neutral-800">{paid ? 'Total paid' : 'Amount due'}</span>
              <span className="text-xl font-bold text-primary-700">{formatCurrency(sale.total, currency)}</span>
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

      <div className="mt-4">
        <p className="mb-1.5 text-center text-xs font-medium text-neutral-500">Receipt paper size</p>
        <div className="flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
          {(['58', '80', 'a4'] as const).map((size) => (
            <button
              key={size}
              onClick={() => setPaper(size)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                paper === size ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {size === 'a4' ? 'A4' : `${size} mm`}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-neutral-400">
          {paper === 'a4'
            ? 'Full A4 page — for a normal office printer.'
            : `${PAPER_MM[paper]} mm roll · ${PAPER_MM[paper] - 10} mm printable width — for a thermal billing machine.`}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={downloadPdf} className="btn-primary col-span-2 py-3"><Download size={16} /> Download PDF</button>
        <button onClick={printReceipt} className="btn-secondary py-3"><Printer size={16} /> Print</button>
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
