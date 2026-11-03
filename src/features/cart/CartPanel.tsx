import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ShoppingCart, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { useDemoStore } from '@/stores/demo-store';
import { calcTotals, formatCurrency } from '@/lib/calculations';

export function CartPanel() {
  const items = useCartStore((s) => s.items);
  const inc = useCartStore((s) => s.inc);
  const dec = useCartStore((s) => s.dec);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const taxRate = useDemoStore((s) => s.settings.tax_rate);
  const currency = useDemoStore((s) => s.settings.currency);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const totals = calcTotals(items, null, taxRate);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-full sm:max-w-3xl px-3 pb-3 safe-bottom">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mb-2 max-h-[55vh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 shadow-panel scrollbar-thin"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700">Current bill</h3>
              <button onClick={clear} className="text-xs font-medium text-danger-600 hover:underline">Clear all</button>
            </div>
            {items.map((it) => (
              <div key={it.product_id} className="flex items-center gap-3 border-b border-neutral-100 py-2 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-800">{it.name}</p>
                  <p className="text-xs text-neutral-400">{it.unit} · {formatCurrency(it.unit_price, currency)}</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200">
                  <button onClick={() => dec(it.product_id)} className="grid h-8 w-8 place-items-center text-neutral-600 active:scale-95" aria-label="Decrease"><Minus size={14} /></button>
                  <span className="w-6 text-center text-sm font-semibold">{it.qty}</span>
                  <button
                    onClick={() => (it.qty < it.max_stock ? inc(it.product_id) : null)}
                    className="grid h-8 w-8 place-items-center text-neutral-600 active:scale-95"
                    aria-label="Increase"
                  ><Plus size={14} /></button>
                </div>
                <span className="w-16 text-right text-sm font-semibold text-neutral-800">{formatCurrency(it.unit_price * it.qty, currency)}</span>
                <button onClick={() => remove(it.product_id)} className="text-neutral-300 hover:text-danger-500" aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="mt-2 flex justify-between px-1 text-sm">
              <span className="text-neutral-500">Subtotal</span>
              <span className="font-semibold">{formatCurrency(totals.subtotal, currency)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        className="flex items-center gap-2.5 rounded-2xl bg-success-700 p-2.5 text-white shadow-panel sm:gap-3 sm:p-3"
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-success-600/70 px-3 py-2"
          aria-label="Toggle cart"
        >
          <ShoppingCart size={18} />
          <motion.div animate={{ rotate: open ? 180 : 0 }}>
            <ChevronUp size={16} />
          </motion.div>
        </button>
        <div className="flex-1">
          <p className="text-[11px] text-success-100 sm:text-xs">{totals.distinctCount} products · {totals.itemCount} items</p>
          <p className="text-base font-bold sm:text-lg">{formatCurrency(totals.subtotal, currency)}</p>
        </div>
        <button onClick={() => nav('/pos/checkout')} className="btn shrink-0 bg-white px-3 py-2.5 text-xs font-semibold text-success-700 hover:bg-success-50 active:scale-[0.98] sm:px-4 sm:text-sm">
          Checkout <ArrowRight size={16} />
        </button>
      </motion.div>
    </div>
  );
}
