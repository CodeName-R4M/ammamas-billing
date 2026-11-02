import { useEffect, useMemo, useState } from 'react';
import { useDemoStore } from '@/stores/demo-store';
import { fetchSalesFromCloud } from '@/lib/sync';
import { formatCurrency } from '@/lib/calculations';
import { PageHeader, StatCard, Empty, Badge } from '@/components/ui/admin';
import { Link } from 'react-router-dom';
import { ShoppingCart, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { ExportButton } from '@/components/common/ExportButton';
import type { Sale } from '@/types';

export function AdminDashboard() {
  const products = useDemoStore((s) => s.products);
  const settings = useDemoStore((s) => s.settings);
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetchSalesFromCloud();
      if (active && res.success) setSales(res.sales);
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter((s) => s.payment_status === 'paid' && s.created_at.slice(0, 10) === today);
    const revenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const units = todaySales.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.qty, 0), 0);
    const lowStock = products.filter((p) => p.active && p.stock <= p.low_stock_threshold);
    const expired = products.filter((p) => p.expiry_date && p.expiry_date < today);
    const pending = sales.filter((s) => s.payment_status === 'pending');
    const profit = todaySales.reduce((sum, s) => sum + s.items.reduce((n, i) => n + (i.unit_price - i.cost_price) * i.qty, 0), 0);
    return { revenue, txn: todaySales.length, units, lowStock: lowStock.length, expired: expired.length, pending: pending.length, profit };
  }, [sales, products]);

  // simple bar chart of last 7 days
  const chart = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ymd = d.toISOString().slice(0, 10);
      const total = sales.filter((s) => s.payment_status === 'paid' && s.created_at.slice(0, 10) === ymd).reduce((sum, s) => sum + s.total, 0);
      days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: total });
    }
    return days;
  }, [sales]);
  const maxBar = Math.max(...chart.map((c) => c.value), 1);

  // top products by qty
  const topProducts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sales) if (s.payment_status === 'paid') for (const it of s.items) map[it.name] = (map[it.name] ?? 0) + it.qty;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sales]);

  // payment method breakdown
  const payBreak = useMemo(() => {
    const cash = sales.filter((s) => s.payment_status === 'paid' && s.payment_method === 'cash').reduce((n, s) => n + s.total, 0);
    const upi = sales.filter((s) => s.payment_status === 'paid' && s.payment_method === 'upi').reduce((n, s) => n + s.total, 0);
    return { cash, upi };
  }, [sales]);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of today's performance"
        action={
          <ExportButton
            options={{
              title: `Daily Store Performance Summary (${todayIso})`,
              subtitle: `Ammamas Business Overview · ${new Date().toLocaleDateString('en-IN', { weekday: 'long' })}`,
              filename: `ammamas-dashboard-${todayIso}`,
              columns: [
                { header: 'Top Selling Products Today', key: 'product_name' },
                { header: 'Units Sold', key: 'qty_sold', align: 'right' },
              ],
              data: topProducts.map(([pName, qty]) => ({
                product_name: pName,
                qty_sold: qty,
              })),
              summaryCards: [
                { label: "Today's Sales", value: formatCurrency(stats.revenue, settings.currency) },
                { label: 'Transactions', value: String(stats.txn) },
                { label: 'Units Sold', value: String(stats.units) },
                { label: 'Gross Profit (est.)', value: formatCurrency(stats.profit, settings.currency) },
              ],
            }}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's sales" value={formatCurrency(stats.revenue, settings.currency)} sub={`${stats.txn} transactions`} tone="success" />
        <StatCard label="Units sold" value={String(stats.units)} sub="today" delay={0.05} />
        <StatCard label="Low stock" value={String(stats.lowStock)} sub="needs attention" tone="warning" delay={0.1} />
        <StatCard label="Gross profit" value={formatCurrency(stats.profit, settings.currency)} sub="today, est." tone="primary" delay={0.15} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Sales trend chart */}
        <div className="card p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Daily sales trend</h3>
          <div className="flex h-40 items-end justify-between gap-2">
            {chart.map((c, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-primary-300 to-primary-500 transition-all"
                    style={{ height: `${(c.value / maxBar) * 100}%`, minHeight: c.value > 0 ? '6px' : '2px' }}
                    title={formatCurrency(c.value, settings.currency)}
                  />
                </div>
                <span className="text-[10px] text-neutral-400">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Payment methods</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs"><span className="text-neutral-500">Cash</span><span className="font-semibold">{formatCurrency(payBreak.cash, settings.currency)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-primary-400" style={{ width: `${(payBreak.cash / (payBreak.cash + payBreak.upi || 1)) * 100}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-xs"><span className="text-neutral-500">UPI</span><span className="font-semibold">{formatCurrency(payBreak.upi, settings.currency)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-primary-600" style={{ width: `${(payBreak.upi / (payBreak.cash + payBreak.upi || 1)) * 100}%` }} /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Top products */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Top-selling products</h3>
          {topProducts.length === 0 ? <Empty message="No sales yet." /> : (
            <div className="space-y-2">
              {topProducts.map(([name, qty], i) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-neutral-600"><span className="grid h-6 w-6 place-items-center rounded-md bg-primary-50 text-xs font-bold text-primary-700">{i + 1}</span> {name}</span>
                  <Badge tone="primary">{qty} sold</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700"><AlertTriangle size={16} className="text-warning-600" /> Alerts</h3>
          <div className="space-y-2 text-sm">
            <AlertRow to="/admin/inventory" icon={<Package size={14} />} tone="warning" label="Low stock products" count={stats.lowStock} />
            <AlertRow to="/admin/inventory" icon={<AlertTriangle size={14} />} tone="danger" label="Expired products" count={stats.expired} />
            <AlertRow to="/admin/payments" icon={<ShoppingCart size={14} />} tone="primary" label="Pending payments" count={stats.pending} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-50 p-3">
            <span className="flex items-center gap-2 text-sm text-primary-700"><TrendingUp size={16} /> Recent transactions</span>
            <Link to="/admin/sales" className="text-xs font-semibold text-primary-700">View all</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ to, icon, label, count, tone }: { to: string; icon: React.ReactNode; label: string; count: number; tone: 'warning' | 'danger' | 'primary' }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-neutral-50">
      <span className="flex items-center gap-2 text-neutral-600">{icon} {label}</span>
      <Badge tone={tone}>{count}</Badge>
    </Link>
  );
}
