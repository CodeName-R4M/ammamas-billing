import { useEffect, useMemo, useState } from 'react';
import { useDemoStore } from '@/stores/demo-store';
import { fetchSalesFromCloud } from '@/lib/sync';
import { PageHeader, StatCard, Empty } from '@/components/ui/admin';
import { formatCurrency } from '@/lib/calculations';
import { ExportButton } from '@/components/common/ExportButton';
import type { Sale } from '@/types';

type Period = 'daily' | 'monthly';

export function AdminReports() {
  const currency = useDemoStore((s) => s.settings.currency);
  const [sales, setSales] = useState<Sale[]>([]);
  const [period, setPeriod] = useState<Period>('daily');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetchSalesFromCloud();
      if (active && res.success) setSales(res.sales);
    })();
    return () => { active = false; };
  }, []);

  const inRange = (iso: string) => (period === 'daily' ? iso.slice(0, 10) === day : iso.slice(0, 7) === month);

  const report = useMemo(() => {
    const paid = sales.filter((s) => s.payment_status === 'paid' && inRange(s.created_at));
    const netSales = paid.reduce((n, s) => n + s.subtotal - s.discount, 0);
    const discounts = paid.reduce((n, s) => n + s.discount, 0);
    const cogs = paid.reduce((n, s) => n + s.items.reduce((m, i) => m + i.cost_price * i.qty, 0), 0);
    const cash = paid.filter((s) => s.payment_method === 'cash').reduce((n, s) => n + s.total, 0);
    const upi = paid.filter((s) => s.payment_method === 'upi').reduce((n, s) => n + s.total, 0);
    const byProduct = new Map<string, { qty: number; revenue: number }>();
    for (const s of paid) for (const i of s.items) {
      const cur = byProduct.get(i.name) ?? { qty: 0, revenue: 0 };
      byProduct.set(i.name, { qty: cur.qty + i.qty, revenue: cur.revenue + i.line_total });
    }
    const pendingCount = sales.filter((s) => s.payment_status === 'pending' && inRange(s.created_at)).length;
    return {
      count: paid.length, netSales, discounts, cogs, cash, upi,
      grossProfit: netSales - cogs,
      products: [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue),
      pendingCount,
    };
  }, [sales, period, day, month]);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Completed sales only. Pending payments are excluded."
        action={
          <ExportButton
            options={{
              title: `Financial & Product Performance Report (${period.toUpperCase()})`,
              subtitle: `Period: ${period === 'daily' ? day : month} · Ammamas Business Analysis`,
              filename: `ammamas-financial-report-${period === 'daily' ? day : month}`,
              columns: [
                { header: 'Product / Item Name', key: 'product_name' },
                { header: 'Units Sold', key: 'units_sold', align: 'right' },
                { header: 'Total Revenue', key: 'revenue_fmt', align: 'right' },
              ],
              data: report.products.map(([pName, val]) => ({
                product_name: pName,
                units_sold: val.qty,
                revenue_fmt: formatCurrency(val.revenue, currency),
              })),
              summaryCards: [
                { label: 'Completed Sales', value: formatCurrency(report.netSales + report.discounts, currency) },
                { label: 'Discounts', value: formatCurrency(report.discounts, currency) },
                { label: 'Cost of Goods', value: formatCurrency(report.cogs, currency) },
                { label: 'Gross Profit', value: formatCurrency(report.grossProfit, currency) },
              ],
            }}
          />
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="flex rounded-xl bg-neutral-100 p-1">
          {(['daily', 'monthly'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition ${period === p ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'}`}>{p}</button>
          ))}
        </div>
        {period === 'daily'
          ? <input type="date" className="input w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
          : <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed sales" value={formatCurrency(report.netSales + report.discounts, currency)} sub={`${report.count} transactions`} tone="success" />
        <StatCard label="Net sales (excl. tax)" value={formatCurrency(report.netSales, currency)} sub={`${formatCurrency(report.discounts, currency)} discounts`} delay={0.05} />
        <StatCard label="Cost of goods" value={formatCurrency(report.cogs, currency)} tone="warning" delay={0.1} />
        <StatCard label="Estimated gross profit" value={formatCurrency(report.grossProfit, currency)} sub="net sales minus cost" tone="primary" delay={0.15} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Payment methods</h3>
          <div className="flex justify-between py-1 text-sm"><span className="text-neutral-500">Cash</span><span className="font-semibold">{formatCurrency(report.cash, currency)}</span></div>
          <div className="flex justify-between py-1 text-sm"><span className="text-neutral-500">UPI</span><span className="font-semibold">{formatCurrency(report.upi, currency)}</span></div>
          <p className="mt-3 text-xs text-neutral-400">{report.pendingCount} pending UPI payment(s) in this period, not counted above.</p>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Product-wise sales</h3>
          {report.products.length === 0 ? <Empty message="No completed sales in this period." /> : (
            <div className="space-y-2">
              {report.products.map(([name, v]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-neutral-600">{name} <span className="text-neutral-400">× {v.qty}</span></span>
                  <span className="font-medium">{formatCurrency(v.revenue, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-neutral-400">Gross profit uses the cost price recorded when each sale was made. Supplier payments are not deducted; net profit needs operating expenses, which are not tracked in this MVP.</p>
    </div>
  );
}
