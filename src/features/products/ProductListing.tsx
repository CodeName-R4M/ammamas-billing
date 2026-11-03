import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Plus, Check, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { useCartStore } from '@/stores/cart-store';
import { formatCurrency } from '@/lib/calculations';
import { ExportButton } from '@/components/common/ExportButton';
import type { Product } from '@/types';

export function ProductListing() {
  const { categoryId } = useParams();
  const nav = useNavigate();
  const categories = useDemoStore((s) => s.categories);
  const products = useDemoStore((s) => s.products);
  const add = useCartStore((s) => s.add);
  const cartItems = useCartStore((s) => s.items);
  const inc = useCartStore((s) => s.inc);
  const dec = useCartStore((s) => s.dec);
  const [q, setQ] = useState('');

  const category = categories.find((c) => c.id === categoryId);
  const list = useMemo(() => {
    const base = products.filter((p) => p.category_id === categoryId && p.active);
    if (!q.trim()) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()));
  }, [products, categoryId, q]);

  const inCart = (id: string) => cartItems.find((i) => i.product_id === id);

  const onAdd = (p: Product) => {
    if (p.stock <= 0) {
      toast.error('Out of stock');
      return;
    }
    add(p);
    toast.success(`${p.name} added to bill`);
  };

  if (!category) {
    return (
      <div className="w-full max-w-full sm:max-w-4xl mx-auto px-2.5 sm:px-4 pt-6 text-center">
        <p className="text-sm text-neutral-400">Category not found.</p>
        <Link to="/pos" className="mt-2 inline-block text-primary-600">Back to categories</Link>
      </div>
    );
  }

  const exportOptions = {
    title: `${category.name} — Product List`,
    subtitle: 'Ammamas Billing',
    filename: `ammamas-${category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-products`,
    columns: [
      { header: 'Product', key: 'name' },
      { header: 'SKU', key: 'sku' },
      { header: 'Unit', key: 'unit' },
      { header: 'Price', key: 'price', align: 'right' as const },
      { header: 'Stock', key: 'stock', align: 'right' as const },
    ],
    data: list.map((p) => ({
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      price: formatCurrency(p.selling_price),
      stock: p.stock,
    })),
  };

  return (
    <div className="w-full max-w-full sm:max-w-4xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-4">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => nav('/pos')} className="btn-ghost rounded-full" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {category.image_url ? (
          <img
            src={category.image_url}
            alt={category.name}
            className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-xs border border-neutral-200"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-100 text-base font-bold text-primary-700">
            {category.name[0]}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-lg font-bold text-neutral-800">{category.name}</h1>
          <p className="text-xs text-neutral-400">
            {list.length} products {category.description ? `· ${category.description}` : ''}
          </p>
        </div>
        <ExportButton options={exportOptions} label="Export" compact />
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input className="input pl-10" placeholder="Search products..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Quick category chips with thumbnails */}
      <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {categories.filter((c) => c.active).map((c) => (
          <Link
            key={c.id}
            to={`/pos/category/${c.id}`}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              c.id === categoryId
                ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-xs'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {c.image_url && (
              <img
                src={c.image_url}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <span>{c.name}</span>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-400">No products found.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((p, i) => {
            const ci = inCart(p.id);
            const low = p.stock <= p.low_stock_threshold;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="card flex flex-col overflow-hidden"
              >
                <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-accent-100 to-primary-100 sm:h-28">
                  <span className="text-2xl font-bold text-primary-300">{p.name.slice(0, 2).toUpperCase()}</span>
                  {p.stock <= 0 && (
                    <span className="badge absolute top-2 right-2 bg-danger-50 text-danger-600">Out</span>
                  )}
                  {p.stock > 0 && low && (
                    <span className="badge absolute top-2 right-2 bg-warning-50 text-warning-700">Low</span>
                  )}
                  {ci && (
                    <span className="badge absolute top-2 left-2 bg-primary-600 text-white">{ci.qty} in bill</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-neutral-800">{p.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">{p.unit} · {p.stock} in stock</p>
                  <p className="mt-1 text-base font-bold text-success-700">{formatCurrency(p.selling_price)}</p>
                  <div className="mt-2">
                    {ci ? (
                      <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50">
                        <button onClick={() => dec(p.id)} className="grid h-9 w-9 place-items-center text-primary-700 active:scale-95" aria-label="Decrease">
                          <Minus size={16} />
                        </button>
                        <span className="font-semibold text-primary-700">{ci.qty}</span>
                        <button
                          onClick={() => (ci.qty < ci.max_stock ? inc(p.id) : toast.error('Stock limit reached'))}
                          className="grid h-9 w-9 place-items-center text-primary-700 active:scale-95"
                          aria-label="Increase"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onAdd(p)}
                        disabled={p.stock <= 0}
                        className="btn-primary w-full py-2 text-sm"
                      >
                        <Plus size={16} /> Add
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
