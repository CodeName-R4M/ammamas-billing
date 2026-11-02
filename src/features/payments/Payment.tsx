import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';
import { ArrowLeft, Banknote, QrCode, CheckCircle2, Clock, ShieldCheck, X, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cart-store';
import { useDemoStore } from '@/stores/demo-store';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { calcTotals, formatCurrency } from '@/lib/calculations';
import type { PaymentMethod, PaymentStatus } from '@/types';

/** What the server returns from pos_begin_sale — the committed, pending sale. */
interface BeginSaleResult {
  sale_id: string;
  payment_id: string;
  receipt_no: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  coupon_code: string | null;
}

/** What the server returns from pos_confirm_sale — proof the payment was recorded. */
interface ConfirmSaleResult {
  ok: boolean;
  already_confirmed: boolean;
  sale_id: string;
  receipt_no: string;
  payment_status: string;
  total: number;
}

export function Payment() {
  const [params] = useSearchParams();
  const method = (params.get('method') as PaymentMethod) ?? 'cash';
  const couponCode = params.get('coupon');
  const nav = useNavigate();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  const settings = useDemoStore((s) => s.settings);
  const coupons = useDemoStore((s) => s.coupons);

  const coupon = useMemo(() => coupons.find((c) => c.code.toLowerCase() === couponCode?.toLowerCase()) ?? null, [coupons, couponCode]);
  const preview = useMemo(() => calcTotals(items, coupon, settings.tax_rate), [items, coupon, settings.tax_rate]);

  // The sale lives in the cloud from the moment the payment screen opens.
  // Until the cashier confirms, it is PENDING: no stock has moved and no money is recorded.
  const [beginState, setBeginState] = useState<'starting' | 'pending' | 'error'>('starting');
  const [sale, setSale] = useState<BeginSaleResult | null>(null);
  const [beginError, setBeginError] = useState('');
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [finalizing, setFinalizing] = useState(false);
  const [showConfirm1, setShowConfirm1] = useState(false);
  const [showConfirm2, setShowConfirm2] = useState(false);

  const saleIdRef = useRef<string | null>(null);
  const confirmedRef = useRef(false);

  const beginSale = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setBeginState('error');
      setBeginError('The cloud server is not configured — a sale cannot be saved.');
      return;
    }
    setBeginState('starting');
    setSale(null);
    const { data, error } = await supabase.rpc('pos_begin_sale', {
      p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
      p_payment_method: method,
      p_coupon_code: couponCode ?? null,
      p_confirm: false,
    });
    if (error) {
      setBeginState('error');
      setBeginError(error.message);
      return;
    }
    const row = data as BeginSaleResult | null;
    if (!row?.sale_id) {
      setBeginState('error');
      setBeginError('The server did not return a sale — nothing was saved.');
      return;
    }
    saleIdRef.current = row.sale_id;
    setSale(row);
    setBeginState('pending');
  };

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      await beginSale();
      // If the screen was closed while the request was in flight, drop the
      // pending sale so an abandoned bill never lingers in the database.
      if (cancelled && saleIdRef.current && !confirmedRef.current) {
        await supabase?.rpc('pos_cancel_sale', { p_sale_id: saleIdRef.current, p_reason: 'Payment screen closed before confirmation' });
        saleIdRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      if (saleIdRef.current && !confirmedRef.current) {
        void supabase?.rpc('pos_cancel_sale', { p_sale_id: saleIdRef.current, p_reason: 'Payment screen closed before confirmation' });
        saleIdRef.current = null;
      }
    };
    // The bill is captured once when the payment screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0 && !confirmedRef.current) {
    return <div className="w-full max-w-full sm:max-w-2xl mx-auto px-4 pt-10 text-center"><p className="text-sm text-neutral-400">Bill is empty.</p><button onClick={() => nav('/pos')} className="btn-primary mt-4">Browse products</button></div>;
  }

  /**
   * The cashier confirms the money was received. This is the ONLY call that
   * marks the sale paid and deducts stock. Success is reported only after the
   * database commits — the UI never assumes the payment went through.
   */
  const confirm = async () => {
    if (!sale || finalizing) return;
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }

    setFinalizing(true);
    try {
      const { data, error } = await supabase.rpc('pos_confirm_sale', {
        p_sale_id: sale.sale_id,
        p_txn_ref: null,
      });
      if (error) {
        // Show the real server reason (e.g. stock ran out) instead of a false success.
        toast.error(error.message);
        return;
      }
      const row = data as ConfirmSaleResult | null;
      if (!row?.ok) {
        toast.error('The server did not record this payment. The sale is still pending.');
        return;
      }
      confirmedRef.current = true;
      setStatus('paid');
      toast.success(row.already_confirmed ? `Sale ${row.receipt_no} was already confirmed` : 'Payment confirmed and sale saved');
      nav(`/pos/receipt/${row.sale_id}`, { replace: true });
      clearCart();
    } finally {
      setFinalizing(false);
    }
  };

  const cancelSale = async () => {
    if (sale && supabase) {
      await supabase.rpc('pos_cancel_sale', { p_sale_id: sale.sale_id, p_reason: 'Cashier cancelled' });
      saleIdRef.current = null;
    }
    clearCart();
    nav('/pos', { replace: true });
  };

  const amount = sale ? sale.total : preview.total;
  const receiptNo = sale?.receipt_no ?? '—';
  const canConfirm = beginState === 'pending' && !finalizing;

  return (
    <div className="w-full max-w-full sm:max-w-3xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="btn-ghost rounded-full" aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-neutral-800">Payment</h1>
          <p className="text-xs text-neutral-400">Bill #{receiptNo}</p>
        </div>
      </div>

      <div className="card mb-4 p-4 text-center">
        <p className="text-sm text-neutral-500">Final payable amount</p>
        <p className="text-3xl font-bold text-primary-700">{formatCurrency(amount, settings.currency)}</p>
      </div>

      {beginState === 'starting' && (
        <div className="card mb-4 flex items-center justify-center gap-2 p-4 text-sm text-neutral-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          Recording this bill in the cloud…
        </div>
      )}

      {beginState === 'error' && (
        <div className="mb-4 rounded-xl bg-danger-50 p-4">
          <div className="flex items-start gap-2 text-danger-700">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">This bill could not be saved</p>
              <p className="mt-1 text-xs">{beginError}</p>
            </div>
          </div>
          <button onClick={beginSale} className="btn-secondary mt-3 flex w-full items-center justify-center gap-2 py-2 text-xs">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )}

      {beginState === 'pending' && (method === 'cash' ? (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-center gap-2 text-primary-700">
            <Banknote size={20} /> <span className="font-semibold">Cash payment</span>
          </div>
          <p className="mb-4 text-center text-sm text-neutral-500">Confirm cash has been received before completing the sale.</p>
          <button onClick={() => setShowConfirm1(true)} disabled={!canConfirm} className="btn-primary w-full py-3">
            Confirm payment
          </button>
        </div>
      ) : (
        <UPIPayment
          upiId={settings.upi_id}
          upiName={settings.upi_name}
          amount={amount}
          currency={settings.currency}
          status={status}
          receiptNo={receiptNo}
          onConfirm={() => setShowConfirm1(true)}
          finalizing={!canConfirm}
        />
      ))}

      {beginState === 'pending' && (
        <button onClick={cancelSale} className="btn-ghost mt-3 w-full py-2 text-xs text-neutral-500">
          Cancel sale
        </button>
      )}

      {/* Confirmation dialog 1 */}
      <AnimatePresence>
        {showConfirm1 && (
          <Modal onClose={() => setShowConfirm1(false)} title={method === 'cash' ? 'Confirm cash received' : 'Confirm UPI received'}>
            <p className="text-sm text-neutral-600">
              {method === 'cash'
                ? `Confirm that ${formatCurrency(amount, settings.currency)} has been received in cash?`
                : `Confirm that ${formatCurrency(amount, settings.currency)} has been received via UPI? Only confirm if you have verified the payment in your UPI app.`}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowConfirm1(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => { setShowConfirm1(false); setShowConfirm2(true); }} className="btn-primary flex-1">Yes, received</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Confirmation dialog 2 */}
      <AnimatePresence>
        {showConfirm2 && (
          <Modal onClose={() => setShowConfirm2(false)} title="Complete this sale?">
            <div className="flex flex-col items-center gap-3">
              <ShieldCheck size={40} className="text-primary-600" />
              <p className="text-sm text-neutral-600">Are you sure you want to complete this sale? This will save the payment to the server and deduct stock.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowConfirm2(false)} className="btn-secondary flex-1">Go back</button>
              <button onClick={confirm} disabled={finalizing} className="btn-primary flex-1">
                {finalizing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Complete sale'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function UPIPayment({ upiId, upiName, amount, currency, status, receiptNo, onConfirm, finalizing }: {
  upiId: string; upiName: string; amount: number; currency: string; status: PaymentStatus; receiptNo: string; onConfirm: () => void; finalizing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(receiptNo)}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, uri, { width: 220, margin: 1, color: { dark: '#2E2B40', light: '#FFFFFF' } }).catch(() => {});
    }
  }, [uri]);

  return (
    <div className="card p-5 text-center">
      <div className="mb-3 flex items-center justify-center gap-2 text-primary-700">
        <QrCode size={20} /> <span className="font-semibold">UPI Payment</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-left text-xs">
        <div><p className="text-neutral-400">Merchant</p><p className="font-medium text-neutral-700">{upiName}</p></div>
        <div><p className="text-neutral-400">UPI ID</p><p className="font-medium text-neutral-700">{upiId}</p></div>
        <div><p className="text-neutral-400">Amount</p><p className="font-medium text-neutral-700">{formatCurrency(amount, currency)}</p></div>
        <div><p className="text-neutral-400">Ref</p><p className="font-medium text-neutral-700">{receiptNo}</p></div>
      </div>
      <div className="mb-3 inline-block rounded-2xl border border-neutral-200 bg-white p-3">
        <canvas ref={canvasRef} />
      </div>
      <div className="mb-4 flex items-center justify-center gap-2">
        {status === 'pending' ? (
          <span className="badge bg-warning-50 text-warning-700"><Clock size={12} /> Pending verification</span>
        ) : (
          <span className="badge bg-success-50 text-success-700"><CheckCircle2 size={12} /> Paid</span>
        )}
      </div>
      <p className="mb-4 text-xs text-neutral-400">Scan with any UPI app. Displaying the QR code does not confirm payment — verify in your UPI app before confirming.</p>
      <button onClick={onConfirm} disabled={finalizing} className="btn-primary w-full py-3">
        {finalizing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'I have received payment'}
      </button>
    </div>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
