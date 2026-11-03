import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Tag, X, Trash2, Plus, Minus, UserPlus, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cart-store';
import { useDemoStore } from '@/stores/demo-store';
import { calcTotals, formatCurrency, validateCoupon } from '@/lib/calculations';
import { listCustomers, createCustomer, type Customer } from '@/lib/customers';
import type { Coupon, PaymentMethod } from '@/types';

export function Checkout() {
  const nav = useNavigate();
  const items = useCartStore((s) => s.items);
  const inc = useCartStore((s) => s.inc);
  const dec = useCartStore((s) => s.dec);
  const remove = useCartStore((s) => s.remove);
  const settings = useDemoStore((s) => s.settings);
  const coupons = useDemoStore((s) => s.coupons);

  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<Coupon | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');

  // Optional buyer attached to this bill.
  const [buyer, setBuyer] = useState<Customer | null>(null);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [showNewBuyer, setShowNewBuyer] = useState(false);
  const [newBuyer, setNewBuyer] = useState({ name: '', phone: '', location: '' });
  const [savingBuyer, setSavingBuyer] = useState(false);

  useEffect(() => {
    if (!buyerQuery.trim()) {
      setMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      listCustomers(buyerQuery).then((rows) => {
        if (active) setMatches(rows);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [buyerQuery]);

  const saveBuyer = async () => {
    if (!newBuyer.name.trim()) {
      toast.error('Enter the buyer name');
      return;
    }
    setSavingBuyer(true);
    try {
      const res = await createCustomer(newBuyer);
      if (!res.ok || !res.customer) {
        toast.error(res.message);
        return;
      }
      setBuyer(res.customer);
      setNewBuyer({ name: '', phone: '', location: '' });
      setShowNewBuyer(false);
      toast.success(res.message);
    } finally {
      setSavingBuyer(false);
    }
  };

  const totals = useMemo(() => calcTotals(items, applied, settings.tax_rate), [items, applied, settings.tax_rate]);

  if (items.length === 0) {
    return (
      <div className="w-full max-w-full sm:max-w-3xl mx-auto px-2.5 sm:px-4 pt-10 text-center">
        <p className="text-sm text-neutral-400">Your bill is empty.</p>
        <button onClick={() => nav('/pos')} className="btn-primary mt-4">Browse products</button>
      </div>
    );
  }

  const applyCoupon = () => {
    const c = coupons.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
    if (!c) { toast.error('Coupon not found'); return; }
    const v = validateCoupon(c, totals.subtotal);
    if (!v.ok) { toast.error(v.message); setApplied(null); return; }
    setApplied(c);
    toast.success(v.message);
  };

  const clearCoupon = () => { setApplied(null); setCode(''); };

  return (
    <div className="w-full max-w-full sm:max-w-3xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="btn-ghost rounded-full" aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-neutral-800">Checkout</h1>
          <p className="text-xs text-neutral-400">Bill number is assigned by the server at payment</p>
        </div>
      </div>

      {/* Items */}
      <div className="card mb-4 p-3">
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">Items</h3>
        {items.map((it) => (
          <div key={it.product_id} className="flex items-center gap-3 border-b border-neutral-100 py-2 last:border-0">
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-800 flex items-center gap-1.5">
                {it.name}
                {it.is_custom && <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">manual</span>}
              </p>
              <p className="text-xs text-neutral-400">{it.unit} · {formatCurrency(it.unit_price, settings.currency)}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200">
              <button onClick={() => dec(it.product_id)} className="grid h-8 w-8 place-items-center text-neutral-600 active:scale-95" aria-label="Decrease"><Minus size={14} /></button>
              <span className="w-6 text-center text-sm font-semibold">{it.qty}</span>
              <button onClick={() => (it.qty < it.max_stock ? inc(it.product_id) : toast.error('Stock limit'))} className="grid h-8 w-8 place-items-center text-neutral-600 active:scale-95" aria-label="Increase"><Plus size={14} /></button>
            </div>
            <span className="w-16 text-right text-sm font-semibold text-neutral-800">{formatCurrency(it.unit_price * it.qty, settings.currency)}</span>
            <button onClick={() => remove(it.product_id)} className="text-neutral-300 hover:text-danger-500" aria-label="Remove"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      {/* Coupon */}
      <div className="card mb-4 p-4">
        <label className="label flex items-center gap-1.5"><Tag size={14} /> Coupon code</label>
        {applied ? (
          <div className="flex items-center justify-between rounded-xl bg-success-50 px-3 py-2.5">
            <span className="text-sm font-semibold text-success-700">{applied.code} applied</span>
            <button onClick={clearCoupon} className="rounded-lg p-1 text-success-700 hover:bg-success-100" aria-label="Remove coupon"><X size={16} /></button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className="input uppercase" placeholder="e.g. SAVE50" value={code} onChange={(e) => setCode(e.target.value)} />
            <button onClick={applyCoupon} className="btn-secondary px-4">Apply</button>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="card mb-4 p-4">
        <Row label="Subtotal" value={formatCurrency(totals.subtotal, settings.currency)} />
        {applied && <Row label={`Discount (${applied.code})`} value={`- ${formatCurrency(totals.discount, settings.currency)}`} accent="success" />}
        {settings.tax_rate > 0 && <Row label={`Tax (${settings.tax_rate}%)`} value={formatCurrency(totals.tax, settings.currency)} />}
        <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2">
          <span className="font-semibold text-neutral-700">Final payable</span>
          <motion.span key={totals.total} initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="text-xl font-bold text-primary-700">
            {formatCurrency(totals.total, settings.currency)}
          </motion.span>
        </div>
      </div>

      {/* Buyer (optional) */}
      <div className="card mb-4 p-4">
        <label className="label flex items-center gap-1.5"><UserPlus size={14} /> Buyer (optional)</label>
        {buyer ? (
          <div className="flex items-center justify-between rounded-xl bg-accent-50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-accent-800">{buyer.name}</p>
              {(buyer.phone || buyer.location) && (
                <p className="truncate text-xs text-accent-600">{[buyer.phone, buyer.location].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <button onClick={() => setBuyer(null)} className="rounded-lg p-1 text-accent-700 hover:bg-accent-100" aria-label="Remove buyer"><X size={16} /></button>
          </div>
        ) : showNewBuyer ? (
          <div className="space-y-2">
            <input className="input" placeholder="Buyer name" value={newBuyer.name} onChange={(e) => setNewBuyer({ ...newBuyer, name: e.target.value })} />
            <input className="input" placeholder="Phone" value={newBuyer.phone} onChange={(e) => setNewBuyer({ ...newBuyer, phone: e.target.value })} />
            <input className="input" placeholder="Location" value={newBuyer.location} onChange={(e) => setNewBuyer({ ...newBuyer, location: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={saveBuyer} disabled={savingBuyer} className="btn-primary flex-1 py-2 text-sm disabled:opacity-60">{savingBuyer ? 'Saving…' : 'Save buyer'}</button>
              <button onClick={() => { setShowNewBuyer(false); setNewBuyer({ name: '', phone: '', location: '' }); }} className="btn-secondary px-4 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="input"
              placeholder="Search by name or phone"
              value={buyerQuery}
              onChange={(e) => setBuyerQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setBuyer(c); setBuyerQuery(''); setMatches([]); }}
                    className="flex w-full items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 text-left last:border-0 hover:bg-accent-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-neutral-800">{c.name}</span>
                      {(c.phone || c.location) && <span className="block truncate text-xs text-neutral-400">{[c.phone, c.location].filter(Boolean).join(' · ')}</span>}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-neutral-300" />
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowNewBuyer(true)} className="btn-secondary w-full py-2 text-sm">Add new buyer</button>
          </div>
        )}
      </div>

      {/* Payment method */}
      <div className="card mb-4 p-4">
        <label className="label">Payment method</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMethod('cash')} className={`btn border px-3 py-3 text-sm ${method === 'cash' ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>Cash</button>
          <button onClick={() => setMethod('upi')} className={`btn border px-3 py-3 text-sm ${method === 'upi' ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>UPI / Google Pay</button>
        </div>
      </div>

      <button
        onClick={() => nav(`/pos/payment?method=${method}${applied ? `&coupon=${applied.code}` : ''}${buyer ? `&customer=${buyer.id}` : ''}`)}
        className="btn-primary w-full py-3"
      >
        Continue to payment
      </button>
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
