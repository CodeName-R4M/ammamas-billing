import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatCurrency } from '@/lib/calculations';
import { ArrowLeft, Search, RefreshCw, AlertTriangle } from 'lucide-react';
import { ExportButton } from '@/components/common/ExportButton';

/** Sales are read back from the database, so every device shows the same history. */
interface CloudSaleRow {
  id: string;
  receipt_no: string;
  cashier_name: string;
  total: number;
  payment_status: string;
  created_at: string;
  sale_items: { count: number }[] | null;
}

export function TransactionHistory() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CloudSaleRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = async () => {
    setState('loading');
    if (!isSupabaseConfigured || !supabase) {
      setState('error');
      setError('The cloud server is not configured.');
      return;
    }
    const { data, error: err } = await supabase
      .from('sales')
      .select('id, receipt_no, cashier_name, total, payment_status, created_at, sale_items(count)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) {
      setState('error');
      setError(err.message);
      return;
    }
    setRows((data ?? []) as CloudSaleRow[]);
    setState('ready');
  };

  useEffect(() => { void load(); }, []);

  const list = rows.filter((s) =>
    s.receipt_no.toLowerCase().includes(q.toLowerCase()) ||
    (s.cashier_name ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  const paidTotal = list.filter((s) => s.payment_status === 'paid').reduce((n, s) => n + s.total, 0);

  return (
    <div className="w-full max-w-full sm:max-w-3xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => nav('/pos')} className="btn-ghost rounded-full p-2" aria-label="Back"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-neutral-800 leading-tight">Transactions</h1>
            <p className="text-xs text-neutral-400">{list.length} recorded bills</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ExportButton
            compact
            options={{
              title: 'Cashier Sales & Transactions Ledger',
              subtitle: `Total Bills: ${list.length} · Collections: ${formatCurrency(paidTotal)}`,
              filename: `ammamas-cashier-sales-${new Date().toISOString().slice(0, 10)}`,
              columns: [
                { header: 'Receipt No', key: 'receipt_no' },
                { header: 'Date & Time', key: 'date_fmt' },
                { header: 'Cashier', key: 'cashier' },
                { header: 'Items Count', key: 'items', align: 'center' },
                { header: 'Amount', key: 'total_fmt', align: 'right' },
                { header: 'Status', key: 'status', align: 'center' },
              ],
              data: list.map((s) => ({
                receipt_no: s.receipt_no,
                date_fmt: new Date(s.created_at).toLocaleString('en-IN'),
                cashier: s.cashier_name || 'Cashier',
                items: s.sale_items?.[0]?.count ?? 0,
                total_fmt: formatCurrency(s.total),
                status: s.payment_status.toUpperCase(),
              })),
              summaryCards: [
                { label: 'Total Bills', value: String(list.length) },
                { label: 'Paid Amount', value: formatCurrency(paidTotal) },
              ],
            }}
          />
          <button onClick={() => void load()} className="btn-ghost rounded-full p-2" aria-label="Refresh"><RefreshCw size={16} /></button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input className="input pl-10" placeholder="Search receipt or cashier..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {state === 'loading' && (
        <div className="card p-8 text-center">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          <p className="mt-2 text-sm text-neutral-400">Loading transactions from the cloud…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="card flex items-center gap-2 p-8 text-center text-sm text-danger-600">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {state === 'ready' && list.length === 0 && (
        <div className="card p-8 text-center text-sm text-neutral-400">No transactions yet.</div>
      )}

      {state === 'ready' && list.length > 0 && (
        <div className="space-y-2">
          {list.map((s) => {
            const count = s.sale_items?.[0]?.count ?? 0;
            const badge = s.payment_status === 'paid'
              ? 'bg-success-50 text-success-700'
              : s.payment_status === 'cancelled'
                ? 'bg-danger-50 text-danger-700'
                : 'bg-warning-50 text-warning-700';
            return (
              <Link key={s.id} to={`/pos/receipt/${s.id}`} className="card flex items-center justify-between p-3 hover:shadow-card-hover">
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{s.receipt_no}</p>
                  <p className="text-xs text-neutral-400">{new Date(s.created_at).toLocaleString('en-IN')} · {s.cashier_name} · {count} items</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-neutral-800">{formatCurrency(s.total)}</p>
                  <span className={`badge ${badge}`}>{s.payment_status}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
