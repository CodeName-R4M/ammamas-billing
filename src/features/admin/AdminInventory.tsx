import { useEffect, useState, useMemo } from 'react';
import { PackagePlus, SlidersHorizontal, AlertTriangle, CalendarClock, ArrowLeftRight, Search, RefreshCw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { syncCatalogFromSupabase } from '@/lib/sync';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { formatCurrency } from '@/lib/calculations';
import { ExportButton } from '@/components/common/ExportButton';
import type { Product } from '@/types';

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function AdminInventory() {
  const products = useDemoStore((s) => s.products);
  const currency = useDemoStore((s) => s.settings.currency);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const lowStock = products.filter((p) => p.active && p.stock <= p.low_stock_threshold);
  const expired = products.filter((p) => p.expiry_date && p.expiry_date < todayIso());
  const expiringSoon = products.filter((p) => p.expiry_date && p.expiry_date >= todayIso() && p.expiry_date <= addDays(30));
  const stockValue = products.reduce((n, p) => n + p.stock * p.cost_price, 0);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`Stock at cost: ${formatCurrency(stockValue, currency)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Inventory Stock Valuation Report',
                subtitle: `Total Products: ${products.length} · Valuation: ${formatCurrency(stockValue, currency)}`,
                filename: `ammamas-inventory-${todayIso()}`,
                columns: [
                  { header: 'SKU', key: 'sku' },
                  { header: 'Product Name', key: 'name' },
                  { header: 'Stock', key: 'stock', align: 'right' },
                  { header: 'Unit', key: 'unit', align: 'center' },
                  { header: 'Cost Price', key: 'cost_price_fmt', align: 'right' },
                  { header: 'Selling Price', key: 'selling_price_fmt', align: 'right' },
                  { header: 'Stock Value', key: 'total_val_fmt', align: 'right' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: products.map((p) => ({
                  sku: p.sku,
                  name: p.name,
                  stock: p.stock,
                  unit: p.unit,
                  cost_price_fmt: formatCurrency(p.cost_price, currency),
                  selling_price_fmt: formatCurrency(p.selling_price, currency),
                  total_val_fmt: formatCurrency(p.stock * p.cost_price, currency),
                  status: p.stock <= 0 ? 'Out of Stock' : p.stock <= p.low_stock_threshold ? 'Low Stock' : 'In Stock',
                })),
                summaryCards: [
                  { label: 'Total Products', value: String(products.length) },
                  { label: 'Inventory Cost', value: formatCurrency(stockValue, currency) },
                  { label: 'Low Stock Items', value: String(lowStock.length) },
                  { label: 'Expired Items', value: String(expired.length) },
                ],
              }}
            />
            <button onClick={() => setStockInOpen(true)} className="btn-primary">
              <PackagePlus size={16} /> Record stock-in
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <AlertPanel title="Low stock" icon={<AlertTriangle size={16} className="text-warning-600" />} empty="All products are above their thresholds." count={lowStock.length}>
          {lowStock.map((p) => (
            <Row key={p.id} product={p} meta={`${p.stock} left · threshold ${p.low_stock_threshold}`} badge={<Badge tone="warning">Low stock</Badge>} onAdjust={() => setAdjusting(p)} />
          ))}
        </AlertPanel>
        <AlertPanel title="Expired" icon={<AlertTriangle size={16} className="text-danger-600" />} empty="No expired products." count={expired.length}>
          {expired.map((p) => (
            <Row key={p.id} product={p} meta={`Expired ${p.expiry_date}`} badge={<Badge tone="danger">Expired</Badge>} onAdjust={() => setAdjusting(p)} />
          ))}
        </AlertPanel>
        <AlertPanel title="Expiring in 30 days" icon={<CalendarClock size={16} className="text-warning-600" />} empty="Nothing expiring soon." count={expiringSoon.length}>
          {expiringSoon.map((p) => (
            <Row key={p.id} product={p} meta={`Expires ${p.expiry_date}`} badge={<Badge tone="warning">Expiring</Badge>} onAdjust={() => setAdjusting(p)} />
          ))}
        </AlertPanel>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">All stock levels</h2>
        <div className="card divide-y divide-neutral-100">
          {products.map((p) => (
            <Row key={p.id} product={p} meta={`${p.sku} · ${p.stock} ${p.unit}`} badge={<Badge tone={p.stock <= 0 ? 'danger' : p.stock <= p.low_stock_threshold ? 'warning' : 'success'}>{p.stock} units</Badge>} onAdjust={() => setAdjusting(p)} />
          ))}
        </div>
      </div>

      <StockInModal open={stockInOpen} onClose={() => setStockInOpen(false)} />
      {adjusting && <AdjustModal key={adjusting.id} product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function AlertPanel({ title, icon, empty, count, children }: { title: string; icon: React.ReactNode; empty: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">{icon} {title} <Badge>{count}</Badge></h3>
      {count === 0 ? <p className="py-4 text-center text-xs text-neutral-400">{empty}</p> : <div className="space-y-2">{children}</div>}
    </div>
  );
}

function Row({ product, meta, badge, onAdjust }: { product: Product; meta: string; badge: React.ReactNode; onAdjust: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-800">{product.name}</p>
        <p className="truncate text-xs text-neutral-400">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <button onClick={onAdjust} className="btn-ghost rounded-lg px-2 py-1.5 text-xs" aria-label={`Adjust ${product.name}`}><SlidersHorizontal size={14} /> Adjust</button>
      </div>
    </div>
  );
}

const stockInSchema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  qty: z.number({ error: 'Enter a quantity' }).int('Whole units only').positive('Must be more than 0'),
  unitCost: z.number({ error: 'Enter a unit cost' }).min(0, 'Must be 0 or more'),
  supplierId: z.string(),
  invoiceRef: z.string(),
  batch_number: z.string(),
  expiry_date: z.string(),
  dateReceived: z.string().min(1, 'Choose a date'),
  notes: z.string(),
});
type StockInForm = z.infer<typeof stockInSchema>;

function StockInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useDemoStore((s) => s.products);
  const suppliers = useDemoStore((s) => s.suppliers);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StockInForm>({
    resolver: zodResolver(stockInSchema),
    defaultValues: { productId: '', qty: 1, unitCost: 0, supplierId: '', invoiceRef: '', batch_number: '', expiry_date: '', dateReceived: todayIso(), notes: '' },
  });

  const submit = async (v: StockInForm) => {
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    const supplier = suppliers.find((s) => s.id === v.supplierId);
    const parts = [
      `Received ${v.dateReceived}`,
      supplier && `Supplier: ${supplier.name}`,
      v.invoiceRef && `Invoice ${v.invoiceRef}`,
      v.notes,
    ].filter(Boolean);
    setSaving(true);
    try {
      // Stock only changes on the server, so the ledger and the stock level cannot disagree.
      const { data, error } = await supabase.rpc('inv_stock_in', {
        p_product_id: v.productId,
        p_qty: v.qty,
        p_unit_cost: v.unitCost,
        p_reason: parts.join(' · ') || null,
        p_expiry_date: v.expiry_date || null,
        p_batch_number: v.batch_number.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      if (!(data as { ok?: boolean } | null)?.ok) { toast.error('The server did not record this stock-in.'); return; }
      await syncCatalogFromSupabase();
      toast.success('Stock recorded');
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record stock-in">
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div>
          <label className="label">Product</label>
          <select className="input" {...register('productId')}>
            <option value="">Select a product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} {p.unit} in stock)</option>)}
          </select>
          {errors.productId && <p className="mt-1 text-xs text-danger-600">{errors.productId.message}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Quantity received</label>
            <input type="number" className="input" {...register('qty', { valueAsNumber: true })} />
            {errors.qty && <p className="mt-1 text-xs text-danger-600">{errors.qty.message}</p>}
          </div>
          <div>
            <label className="label">Unit cost</label>
            <input type="number" step="0.01" className="input" {...register('unitCost', { valueAsNumber: true })} />
            {errors.unitCost && <p className="mt-1 text-xs text-danger-600">{errors.unitCost.message}</p>}
          </div>
          <div>
            <label className="label">Supplier</label>
            <select className="input" {...register('supplierId')}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Invoice reference</label>
            <input className="input" {...register('invoiceRef')} />
          </div>
          <div>
            <label className="label">Batch number</label>
            <input className="input" {...register('batch_number')} />
          </div>
          <div>
            <label className="label">Expiry date</label>
            <input type="date" className="input" {...register('expiry_date')} />
          </div>
          <div>
            <label className="label">Date received</label>
            <input type="date" className="input" {...register('dateReceived')} />
            {errors.dateReceived && <p className="mt-1 text-xs text-danger-600">{errors.dateReceived.message}</p>}
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" {...register('notes')} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Save stock-in'}
        </button>
      </form>
    </Modal>
  );
}

const adjustSchema = z.object({
  type: z.enum(['adjustment', 'damaged', 'expired']),
  qty: z.number({ error: 'Enter a quantity' }).int('Whole units only').refine((n) => n !== 0, 'Enter a non-zero quantity'),
  reason: z.string().trim().min(1, 'Give a reason'),
});
type AdjustForm = z.infer<typeof adjustSchema>;

function AdjustModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { type: 'damaged', qty: -1, reason: '' },
  });

  const submit = async (v: AdjustForm) => {
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    if (product.stock + v.qty < 0) {
      toast.error(`Cannot remove more than the ${product.stock} units in stock`);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('inv_adjust', {
        p_product_id: product.id,
        p_qty: v.qty,
        p_reason: v.reason,
        p_type: v.type,
      });
      if (error) { toast.error(error.message); return; }
      if (!(data as { ok?: boolean } | null)?.ok) { toast.error('The server did not record this adjustment.'); return; }
      await syncCatalogFromSupabase();
      toast.success('Stock adjusted');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Adjust ${product.name}`}>
      <p className="mb-3 text-sm text-neutral-500">Current stock: <span className="font-semibold text-neutral-800">{product.stock} {product.unit}</span>. Use a negative quantity to remove stock.</p>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Type</label>
            <select className="input" {...register('type')}>
              <option value="damaged">Damaged</option>
              <option value="expired">Expired (write-off)</option>
              <option value="adjustment">Manual correction</option>
            </select>
          </div>
          <div>
            <label className="label">Quantity (+/-)</label>
            <input type="number" className="input" {...register('qty', { valueAsNumber: true })} />
            {errors.qty && <p className="mt-1 text-xs text-danger-600">{errors.qty.message}</p>}
          </div>
        </div>
        <div>
          <label className="label">Reason</label>
          <input className="input" placeholder="e.g. Packet torn in store" {...register('reason')} />
          {errors.reason && <p className="mt-1 text-xs text-danger-600">{errors.reason.message}</p>}
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Save adjustment'}
        </button>
      </form>
    </Modal>
  );
}

interface StockMovementRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  products?: { name: string; sku: string; unit: string } | null;
}

export function AdminMovements() {
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const allProducts = useDemoStore((s) => s.products);

  const loadMovements = async () => {
    setLoading(true);
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('id, product_id, movement_type, quantity, reason, created_at, products(name, sku, unit)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        toast.error(`Failed to load movements: ${error.message}`);
      } else {
        setMovements((data ?? []) as unknown as StockMovementRow[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMovements();
  }, []);

  const getProductName = (m: StockMovementRow) => {
    if (m.products?.name) return m.products.name;
    const found = allProducts.find((p) => p.id === m.product_id);
    return found?.name ?? 'Unknown Product';
  };

  const getProductSku = (m: StockMovementRow) => {
    if (m.products?.sku) return m.products.sku;
    const found = allProducts.find((p) => p.id === m.product_id);
    return found?.sku ?? '—';
  };

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter !== 'all' && m.movement_type !== typeFilter) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      const pName = getProductName(m).toLowerCase();
      const pSku = getProductSku(m).toLowerCase();
      const reason = (m.reason ?? '').toLowerCase();
      return pName.includes(needle) || pSku.includes(needle) || reason.includes(needle);
    });
  }, [movements, typeFilter, q, allProducts]);

  const movementBadgeTone = (type: string): 'success' | 'danger' | 'warning' | 'primary' | 'neutral' => {
    switch (type) {
      case 'in':
        return 'success';
      case 'out':
      case 'sale':
        return 'primary';
      case 'damaged':
      case 'expired':
        return 'danger';
      case 'adjustment':
      default:
        return 'warning';
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        subtitle="Audit log of all stock changes (sales, restocks, adjustments, write-offs)"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Stock Movements Audit Report',
                subtitle: `Total Logged Movements: ${filtered.length}`,
                filename: `stock-movements-${todayIso()}`,
                columns: [
                  { header: 'Date & Time', key: 'date_formatted' },
                  { header: 'Product Name', key: 'product_name' },
                  { header: 'SKU', key: 'sku' },
                  { header: 'Movement Type', key: 'movement_type', align: 'center' },
                  { header: 'Quantity Change', key: 'qty_formatted', align: 'right' },
                  { header: 'Reason / Note', key: 'reason' },
                ],
                data: filtered.map((m) => ({
                  date_formatted: new Date(m.created_at).toLocaleString('en-IN'),
                  product_name: getProductName(m),
                  sku: getProductSku(m),
                  movement_type: m.movement_type.toUpperCase(),
                  qty_formatted: `${m.quantity > 0 ? '+' : ''}${m.quantity}`,
                  reason: m.reason || 'Standard transaction',
                })),
                summaryCards: [
                  { label: 'Total Movements', value: String(filtered.length) },
                  { label: 'Stock-In Records', value: String(filtered.filter((m) => m.movement_type === 'in').length) },
                  { label: 'Sales Deductions', value: String(filtered.filter((m) => m.movement_type === 'sale').length) },
                  { label: 'Adjustments/Loss', value: String(filtered.filter((m) => ['damaged', 'expired', 'adjustment'].includes(m.movement_type)).length) },
                ],
              }}
            />
            <button onClick={() => void loadMovements()} className="btn-secondary">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            className="input pl-9"
            placeholder="Search by product, SKU, or reason..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Movement Types</option>
          <option value="in">Stock In (Received)</option>
          <option value="sale">Sale Deductions</option>
          <option value="adjustment">Manual Adjustments</option>
          <option value="damaged">Damaged Goods</option>
          <option value="expired">Expired Write-offs</option>
        </select>
      </div>

      {loading && <Empty message="Loading stock movements from cloud audit logs..." />}
      {!loading && filtered.length === 0 && <Empty message="No stock movements match these filters." />}

      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((m) => {
                  const pName = getProductName(m);
                  const pSku = getProductSku(m);
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50/60 transition">
                      <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-neutral-800 text-sm leading-tight">{pName}</p>
                        <p className="text-xs text-neutral-400">{pSku}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={movementBadgeTone(m.movement_type)}>
                          {m.movement_type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                        <span className={isPositive ? 'text-success-700' : 'text-neutral-800'}>
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {m.reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
