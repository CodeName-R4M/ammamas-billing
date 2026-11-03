import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Badge, Modal, Empty, StatCard } from '@/components/ui/admin';
import { ExportButton } from '@/components/common/ExportButton';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demo-store';
import { formatCurrency } from '@/lib/calculations';

/** The expense heads the shop tracks day to day. */
const CATEGORIES = ['rent', 'utilities', 'salary', 'supplies', 'transport', 'misc'] as const;
type ExpenseCategory = (typeof CATEGORIES)[number];

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  spent_on: string;
  notes: string | null;
  created_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** First day of the current month — the default filter window. */
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export function AdminExpenses() {
  const currency = useDemoStore((s) => s.settings.currency);
  const [rows, setRows] = useState<Expense[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState<'all' | ExpenseCategory>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setState('error');
      setError('The cloud server is not configured — expenses cannot be loaded.');
      return;
    }
    setState('loading');
    const { data, error: err } = await supabase
      .from('expenses')
      .select('id, title, amount, category, spent_on, notes, created_at')
      .order('spent_on', { ascending: false })
      .limit(500);
    if (err) {
      setState('error');
      setError(err.message);
      return;
    }
    setRows((data ?? []) as Expense[]);
    setState('ready');
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (category !== 'all' && r.category !== category) return false;
        if (from && r.spent_on < from) return false;
        if (to && r.spent_on > to) return false;
        return true;
      }),
    [rows, category, from, to],
  );

  const total = useMemo(() => filtered.reduce((n, r) => n + Number(r.amount), 0), [filtered]);
  const thisMonth = useMemo(() => rows.filter((r) => r.spent_on >= monthStart()).reduce((n, r) => n + Number(r.amount), 0), [rows]);

  const remove = async (row: Expense) => {
    if (!supabase) return;
    if (!window.confirm(`Delete the expense "${row.title}"?`)) return;
    setBusy(row.id);
    try {
      const { error: err } = await supabase.from('expenses').delete().eq('id', row.id);
      if (err) {
        toast.error(err.message);
        return;
      }
      toast.success('Expense deleted');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const exportOptions = {
    title: 'Business Expense Register',
    subtitle: `${from} to ${to}${category === 'all' ? '' : ` · ${category.toUpperCase()}`} · Total: ${formatCurrency(total, currency)}`,
    filename: `ammamas-expenses-${today()}`,
    columns: [
      { header: 'Date', key: 'date' },
      { header: 'Expense', key: 'title' },
      { header: 'Category', key: 'category' },
      { header: 'Notes', key: 'notes' },
      { header: `Amount (${currency})`, key: 'amount', align: 'right' as const },
    ],
    data: filtered.map((r) => ({
      date: r.spent_on,
      title: r.title,
      category: r.category,
      notes: r.notes || '—',
      amount: formatCurrency(Number(r.amount), currency),
    })),
    summaryCards: [
      { label: 'Entries', value: String(filtered.length) },
      { label: 'Total Spent', value: formatCurrency(total, currency) },
      { label: 'This Month', value: formatCurrency(thisMonth, currency) },
    ],
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Money spent on running the shop — rent, utilities, salaries and more"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton options={exportOptions} />
            <button onClick={() => void load()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
            <button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={16} /> Add expense</button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Filtered Total" value={formatCurrency(total, currency)} tone="danger" />
        <StatCard label="This Month" value={formatCurrency(thisMonth, currency)} sub={`${rows.length} entries logged`} tone="warning" delay={0.05} />
        <StatCard label="Entries in Range" value={String(filtered.length)} tone="primary" delay={0.1} />
      </div>

      {/* Filters */}
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value as 'all' | ExpenseCategory)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {state === 'loading' && <Empty message="Loading expenses from the cloud…" />}
      {state === 'error' && <Empty message={error} />}
      {state === 'ready' && filtered.length === 0 && <Empty message="No expenses in this range." />}

      {state === 'ready' && filtered.length > 0 && (
        <div className="card divide-y divide-neutral-100">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-danger-50 text-danger-600"><Wallet size={16} /></div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{r.title}</p>
                  <p className="text-xs text-neutral-400">
                    {r.spent_on} · <span className="capitalize">{r.category}</span>{r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-danger-600">{formatCurrency(Number(r.amount), currency)}</span>
                <button onClick={() => void remove(r)} disabled={busy === r.id} className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddExpenseModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void load(); }} />}
    </div>
  );
}

function AddExpenseModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    title: '',
    amount: '',
    category: 'misc' as ExpenseCategory,
    spent_on: today(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    const amount = Number(form.amount);
    if (!form.title.trim()) { toast.error('Enter the expense title'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        title: form.title.trim(),
        amount,
        category: form.category,
        spent_on: form.spent_on,
        notes: form.notes.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Expense recorded');
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add expense">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">What was it for?</label>
          <input className="input" placeholder="e.g. Electricity bill" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Save expense'}
        </button>
      </form>
      <div className="mt-3 flex items-center gap-1.5">
        <Badge tone="warning">Admin only</Badge>
        <span className="text-[10px] text-neutral-400">Expenses are not visible to cashiers.</span>
      </div>
    </Modal>
  );
}
