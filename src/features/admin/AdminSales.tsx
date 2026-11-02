import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useDemoStore } from '@/stores/demo-store';
import { fetchSalesFromCloud } from '@/lib/sync';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { formatCurrency } from '@/lib/calculations';
import { ExportButton } from '@/components/common/ExportButton';
import type { Sale, PaymentStatus } from '@/types';

const statusTone: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success', pending: 'warning', failed: 'danger', cancelled: 'neutral',
};

/** Sales and payments are always read from the database, never from a local copy. */
function useCloudSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = async () => {
    setState('loading');
    const res = await fetchSalesFromCloud();
    if (!res.success) { setState('error'); setError(res.message); return; }
    setSales(res.sales);
    setState('ready');
  };

  useEffect(() => { void load(); }, []);
  return { sales, state, error, reload: load };
}

export function AdminSales() {
  const { sales, state, error, reload } = useCloudSales();
  const currency = useDemoStore((s) => s.settings.currency);
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<'all' | 'cash' | 'upi'>('all');
  const [selected, setSelected] = useState<Sale | null>(null);

  const list = useMemo(() => sales.filter((s) => {
    if (method !== 'all' && s.payment_method !== method) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return s.receipt_no.toLowerCase().includes(needle) || s.cashier_name.toLowerCase().includes(needle);
  }), [sales, q, method]);

  const totalRevenue = list.filter((s) => s.payment_status === 'paid').reduce((n, s) => n + s.total, 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={`${sales.length} completed transactions`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Sales Transactions Report',
                subtitle: `Total Sales: ${list.length} · Revenue: ${formatCurrency(totalRevenue, currency)}`,
                filename: `ammamas-sales-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Receipt No', key: 'receipt_no' },
                  { header: 'Date & Time', key: 'date_fmt' },
                  { header: 'Cashier', key: 'cashier_name' },
                  { header: 'Items Count', key: 'items_count', align: 'center' },
                  { header: 'Subtotal', key: 'subtotal_fmt', align: 'right' },
                  { header: 'Discount', key: 'discount_fmt', align: 'right' },
                  { header: 'Total', key: 'total_fmt', align: 'right' },
                  { header: 'Payment Method', key: 'payment_method', align: 'center' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: list.map((s) => ({
                  receipt_no: s.receipt_no,
                  date_fmt: new Date(s.created_at).toLocaleString('en-IN'),
                  cashier_name: s.cashier_name,
                  items_count: s.items.length,
                  subtotal_fmt: formatCurrency(s.subtotal, currency),
                  discount_fmt: formatCurrency(s.discount, currency),
                  total_fmt: formatCurrency(s.total, currency),
                  payment_method: s.payment_method.toUpperCase(),
                  status: s.payment_status.toUpperCase(),
                })),
                summaryCards: [
                  { label: 'Transactions', value: String(list.length) },
                  { label: 'Paid Revenue', value: formatCurrency(totalRevenue, currency) },
                  { label: 'Cash Sales', value: String(list.filter((s) => s.payment_method === 'cash').length) },
                  { label: 'UPI Sales', value: String(list.filter((s) => s.payment_method === 'upi').length) },
                ],
              }}
            />
            <button onClick={() => void reload()} className="btn-secondary">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        }
      />
      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input className="input pl-9" placeholder="Search receipt or cashier" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'all' | 'cash' | 'upi')}>
          <option value="all">All payment methods</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
        </select>
      </div>

      {state === 'loading' && <Empty message="Loading sales from the cloud…" />}
      {state === 'error' && <Empty message={error} />}
      {state === 'ready' && (list.length === 0 ? <Empty message="No sales match these filters." /> : (
        <div className="card divide-y divide-neutral-100">
          {list.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-neutral-50">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-800">{s.receipt_no}</p>
                <p className="truncate text-xs text-neutral-400">{new Date(s.created_at).toLocaleString('en-IN')} · {s.cashier_name} · {s.items.length} lines</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={statusTone[s.payment_status]}>{s.payment_status}</Badge>
                <span className="w-24 text-right text-sm font-bold text-neutral-800">{formatCurrency(s.total, currency)}</span>
              </div>
            </button>
          ))}
        </div>
      ))}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.receipt_no ?? ''}>
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-neutral-500"><span>Cashier</span><span className="text-neutral-800">{selected.cashier_name}</span></div>
            <div className="flex justify-between text-neutral-500"><span>Payment</span><span className="text-neutral-800">{selected.payment_method.toUpperCase()} · {selected.payment_status}</span></div>
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {selected.items.map((it) => (
                <div key={it.product_id} className="flex justify-between px-3 py-2">
                  <span>{it.name} × {it.qty}</span>
                  <span className="font-medium">{formatCurrency(it.line_total, currency)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-neutral-500"><span>Discount{selected.coupon_code ? ` (${selected.coupon_code})` : ''}</span><span>{formatCurrency(selected.discount, currency)}</span></div>
            <div className="flex justify-between font-bold text-neutral-800"><span>Total</span><span>{formatCurrency(selected.total, currency)}</span></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AdminPayments() {
  const { sales, state, error, reload } = useCloudSales();
  const currency = useDemoStore((s) => s.settings.currency);
  const paid = sales.filter((s) => s.payment_status === 'paid');
  const pending = sales.filter((s) => s.payment_status === 'pending');
  const cashTotal = paid.filter((s) => s.payment_method === 'cash').reduce((n, s) => n + s.total, 0);
  const upiTotal = paid.filter((s) => s.payment_method === 'upi').reduce((n, s) => n + s.total, 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Only paid transactions count toward revenue"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Payments & Collections Ledger',
                subtitle: `Total Payments: ${sales.length} · Cash: ${formatCurrency(cashTotal, currency)} · UPI: ${formatCurrency(upiTotal, currency)}`,
                filename: `ammamas-payments-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Receipt No', key: 'receipt_no' },
                  { header: 'Date & Time', key: 'date_fmt' },
                  { header: 'Cashier', key: 'cashier_name' },
                  { header: 'Payment Method', key: 'payment_method', align: 'center' },
                  { header: 'Amount', key: 'amount_fmt', align: 'right' },
                  { header: 'Payment Status', key: 'status', align: 'center' },
                ],
                data: sales.map((s) => ({
                  receipt_no: s.receipt_no,
                  date_fmt: new Date(s.created_at).toLocaleString('en-IN'),
                  cashier_name: s.cashier_name,
                  payment_method: s.payment_method.toUpperCase(),
                  amount_fmt: formatCurrency(s.total, currency),
                  status: s.payment_status.toUpperCase(),
                })),
                summaryCards: [
                  { label: 'Cash Collected', value: formatCurrency(cashTotal, currency) },
                  { label: 'UPI Collected', value: formatCurrency(upiTotal, currency) },
                  { label: 'Total Paid', value: formatCurrency(cashTotal + upiTotal, currency) },
                  { label: 'Pending Count', value: String(pending.length) },
                ],
              }}
            />
            <button onClick={() => void reload()} className="btn-secondary">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-neutral-400">Cash collected</p><p className="mt-1 text-xl font-bold text-neutral-800">{formatCurrency(cashTotal, currency)}</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-400">UPI collected</p><p className="mt-1 text-xl font-bold text-neutral-800">{formatCurrency(upiTotal, currency)}</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-400">Pending verification</p><p className="mt-1 text-xl font-bold text-warning-700">{pending.length}</p></div>
      </div>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-neutral-700">Recent payments</h2>
      {state === 'loading' && <Empty message="Loading payments from the cloud…" />}
      {state === 'error' && <Empty message={error} />}
      {state === 'ready' && (sales.length === 0 ? <Empty message="No payments recorded yet." /> : (
        <div className="card divide-y divide-neutral-100">
          {sales.slice(0, 50).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">{s.receipt_no} · {s.payment_method.toUpperCase()}</p>
                <p className="text-xs text-neutral-400">{new Date(s.created_at).toLocaleString('en-IN')} · {s.cashier_name}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={statusTone[s.payment_status]}>{s.payment_status}</Badge>
                <span className="w-24 text-right text-sm font-semibold">{formatCurrency(s.total, currency)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
