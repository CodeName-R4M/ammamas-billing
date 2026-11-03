import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Badge, Modal, Empty, StatCard } from '@/components/ui/admin';
import { ExportButton } from '@/components/common/ExportButton';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demo-store';
import { formatCurrency } from '@/lib/calculations';

type InvestmentType = 'capital_in' | 'withdrawal' | 'reinvestment';

const TYPES: { value: InvestmentType; label: string; hint: string }[] = [
  { value: 'capital_in', label: 'Capital in', hint: 'Money you put into the business' },
  { value: 'withdrawal', label: 'Withdrawal', hint: 'Money you take out of the business' },
  { value: 'reinvestment', label: 'Reinvestment', hint: 'Profit put back into the business' },
];

interface Investment {
  id: string;
  title: string;
  amount: number;
  type: InvestmentType;
  entry_date: string;
  notes: string | null;
  created_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AdminInvestments() {
  const currency = useDemoStore((s) => s.settings.currency);
  const [rows, setRows] = useState<Investment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setState('error');
      setError('The cloud server is not configured — investments cannot be loaded.');
      return;
    }
    setState('loading');
    const { data, error: err } = await supabase
      .from('investments')
      .select('id, title, amount, type, entry_date, notes, created_at')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(500);
    if (err) {
      setState('error');
      setError(err.message);
      return;
    }
    setRows((data ?? []) as Investment[]);
    setState('ready');
  };

  useEffect(() => {
    void load();
  }, []);

  // Oldest first, so every row can carry the balance that was left after it.
  const ledger = useMemo(() => {
    let running = 0;
    return rows.map((r, i) => {
      const delta = r.type === 'withdrawal' ? -Number(r.amount) : Number(r.amount);
      running += delta;
      return { ...r, index: String(i + 1).padStart(3, '0'), delta, balance: running };
    });
  }, [rows]);

  // Newest first for the on-screen list.
  const view = useMemo(() => [...ledger].reverse(), [ledger]);

  const totalIn = useMemo(
    () => rows.filter((r) => r.type !== 'withdrawal').reduce((n, r) => n + Number(r.amount), 0),
    [rows],
  );
  const totalOut = useMemo(
    () => rows.filter((r) => r.type === 'withdrawal').reduce((n, r) => n + Number(r.amount), 0),
    [rows],
  );
  const net = totalIn - totalOut;

  const remove = async (row: Investment) => {
    if (!supabase) return;
    if (!window.confirm(`Delete the entry "${row.title}"?`)) return;
    setBusy(row.id);
    try {
      const { error: err } = await supabase.from('investments').delete().eq('id', row.id);
      if (err) {
        toast.error(err.message);
        return;
      }
      toast.success('Entry deleted');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const exportOptions = {
    title: 'Investment & Capital Ledger',
    subtitle: `Net capital: ${formatCurrency(net, currency)} · In: ${formatCurrency(totalIn, currency)} · Out: ${formatCurrency(totalOut, currency)}`,
    filename: `ammamas-investments-${today()}`,
    columns: [
      { header: 'Entry #', key: 'index', align: 'center' as const },
      { header: 'Date', key: 'date' },
      { header: 'Particulars', key: 'title' },
      { header: 'Type', key: 'type' },
      { header: `Amount (${currency})`, key: 'amount', align: 'right' as const },
      { header: `Running Balance (${currency})`, key: 'balance', align: 'right' as const },
      { header: 'Notes', key: 'notes' },
    ],
    data: ledger.map((r) => ({
      index: r.index,
      date: r.entry_date,
      title: r.title,
      type: r.type === 'withdrawal' ? 'Withdrawal' : r.type === 'reinvestment' ? 'Reinvestment' : 'Capital in',
      amount: `${r.type === 'withdrawal' ? '-' : ''}${formatCurrency(Number(r.amount), currency)}`,
      balance: formatCurrency(r.balance, currency),
      notes: r.notes || '—',
    })),
    summaryCards: [
      { label: 'Total Invested', value: formatCurrency(totalIn, currency) },
      { label: 'Total Withdrawn', value: formatCurrency(totalOut, currency) },
      { label: 'Net Capital', value: formatCurrency(net, currency) },
    ],
  };

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Track the capital put into the business and the money taken out"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton options={exportOptions} />
            <button onClick={() => void load()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
            <button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={16} /> Add entry</button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Invested" value={formatCurrency(totalIn, currency)} sub="Capital in + reinvestment" tone="success" />
        <StatCard label="Total Withdrawn" value={formatCurrency(totalOut, currency)} sub="Money taken out" tone="danger" delay={0.05} />
        <StatCard label="Net Capital" value={formatCurrency(net, currency)} sub="Invested − Withdrawn" tone="primary" delay={0.1} />
      </div>

      {state === 'loading' && <Empty message="Loading the investment ledger from the cloud…" />}
      {state === 'error' && <Empty message={error} />}
      {state === 'ready' && rows.length === 0 && <Empty message="No capital entries yet. Add your first investment." />}

      {state === 'ready' && view.length > 0 && (
        <div className="card divide-y divide-neutral-100">
          {view.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-full ${r.type === 'withdrawal' ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600'}`}>
                  {r.type === 'withdrawal' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">
                    <span className="mr-1.5 text-xs font-normal text-neutral-400">#{r.index}</span>
                    {r.title}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {r.entry_date} · {r.type === 'withdrawal' ? 'Withdrawal' : r.type === 'reinvestment' ? 'Reinvestment' : 'Capital in'}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-sm font-bold ${r.type === 'withdrawal' ? 'text-danger-600' : 'text-success-600'}`}>
                    {r.type === 'withdrawal' ? '−' : '+'}{formatCurrency(Number(r.amount), currency)}
                  </p>
                  <p className="text-[11px] text-neutral-400">balance {formatCurrency(r.balance, currency)}</p>
                </div>
                <button onClick={() => void remove(r)} disabled={busy === r.id} className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddInvestmentModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void load(); }} />}
    </div>
  );
}

function AddInvestmentModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    title: '',
    amount: '',
    type: 'capital_in' as InvestmentType,
    entry_date: today(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    const amount = Number(form.amount);
    if (!form.title.trim()) { toast.error('Enter what this entry is for'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('investments').insert({
        title: form.title.trim(),
        amount,
        type: form.type,
        entry_date: form.entry_date,
        notes: form.notes.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Entry recorded');
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add investment entry">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Particulars</label>
          <input className="input" placeholder="e.g. Owner capital — opening" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvestmentType })}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-neutral-400">{TYPES.find((t) => t.value === form.type)?.hint}</p>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Save entry'}
        </button>
      </form>
      <div className="mt-3 flex items-center gap-1.5">
        <Badge tone="primary"><PiggyBank size={11} /> Owner records</Badge>
        <span className="text-[10px] text-neutral-400">Admin only — cashiers cannot see capital entries.</span>
      </div>
    </Modal>
  );
}
