import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Search, Pencil, Users, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Modal, Empty, StatCard } from '@/components/ui/admin';
import { ExportButton } from '@/components/common/ExportButton';
import {
  listCustomerSummary,
  listCustomerBills,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type Customer,
  type CustomerSummary,
  type CustomerBill,
} from '@/lib/customers';
import { useDemoStore } from '@/stores/demo-store';
import { formatCurrency } from '@/lib/calculations';

const today = () => new Date().toISOString().slice(0, 10);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function AdminCustomers() {
  const currency = useDemoStore((s) => s.settings.currency);
  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [ledgerFor, setLedgerFor] = useState<CustomerSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setState('loading');
    setRows(await listCustomerSummary());
    setState('ready');
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const totalBilled = useMemo(() => filtered.reduce((n, c) => n + Number(c.total_billed), 0), [filtered]);
  const totalBills = useMemo(() => filtered.reduce((n, c) => n + Number(c.bill_count), 0), [filtered]);

  const remove = async (c: CustomerSummary) => {
    if (!window.confirm(`Delete the buyer "${c.name}"? Their past bills stay in the sales records.`)) return;
    setBusy(c.id);
    try {
      const res = await deleteCustomer(c.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const exportOptions = {
    title: 'Buyer / Customer Registry',
    subtitle: `Total buyers: ${filtered.length} · Bills: ${totalBills} · Billed: ${formatCurrency(totalBilled, currency)}`,
    filename: `ammamas-customers-${today()}`,
    columns: [
      { header: 'Buyer Name', key: 'name' },
      { header: 'Phone', key: 'phone' },
      { header: 'Location', key: 'location' },
      { header: 'Bills', key: 'bills', align: 'center' as const },
      { header: `Total Billed (${currency})`, key: 'billed', align: 'right' as const },
      { header: 'Last Bill', key: 'last' },
    ],
    data: filtered.map((c) => ({
      name: c.name,
      phone: c.phone || '—',
      location: c.location || '—',
      bills: c.bill_count,
      billed: formatCurrency(Number(c.total_billed), currency),
      last: c.last_bill_at ? new Date(c.last_bill_at).toLocaleString() : '—',
    })),
    summaryCards: [
      { label: 'Total Buyers', value: String(filtered.length) },
      { label: 'Total Bills', value: String(totalBills) },
      { label: 'Total Billed', value: formatCurrency(totalBilled, currency) },
    ],
  };

  return (
    <div>
      <PageHeader
        title="Buyers"
        subtitle="Your customer registry — attach a buyer to any bill to build their ledger"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton options={exportOptions} />
            <button onClick={() => void load()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
            <button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={16} /> Add buyer</button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Buyers" value={String(filtered.length)} tone="primary" />
        <StatCard label="Bills Linked" value={String(totalBills)} tone="warning" delay={0.05} />
        <StatCard label="Total Billed" value={formatCurrency(totalBilled, currency)} tone="success" delay={0.1} />
      </div>

      <div className="card mb-4 flex items-center gap-2 p-3">
        <Search size={16} className="text-neutral-400" />
        <input
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Search buyers by name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {state === 'loading' && <Empty message="Loading buyers from the cloud…" />}
      {state === 'ready' && filtered.length === 0 && <Empty message="No buyers yet. Add your first buyer to start a ledger." />}

      {state === 'ready' && filtered.length > 0 && (
        <div className="card divide-y divide-neutral-100">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700">{initials(c.name)}</div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{c.name}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                    {c.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {c.location}</span>}
                    <span>{c.bill_count} bills · {formatCurrency(Number(c.total_billed), currency)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setLedgerFor(c)} className="btn-secondary px-2.5 py-1.5 text-xs"><Users size={14} /> Ledger</button>
                <button onClick={() => setEditing(c)} disabled={busy === c.id} className="btn-ghost px-2 py-1.5 text-xs" title="Edit"><Pencil size={14} /></button>
                <button onClick={() => void remove(c)} disabled={busy === c.id} className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50" title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <BuyerModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); void load(); }} />}
      {editing && (
        <BuyerModal
          buyer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {ledgerFor && <LedgerModal buyer={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function BuyerModal({ buyer, onClose, onSaved }: { buyer?: Customer; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: buyer?.name ?? '', phone: buyer?.phone ?? '', location: buyer?.location ?? '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Enter the buyer name'); return; }
    setSaving(true);
    try {
      const res = buyer
        ? await updateCustomer(buyer.id, { name: form.name.trim(), phone: form.phone.trim() || undefined, location: form.location.trim() || undefined })
        : await createCustomer({ name: form.name.trim(), phone: form.phone.trim(), location: form.location.trim() });
      if (!res.ok) { toast.error(res.message); return; }
      toast.success(res.message);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={buyer ? 'Edit buyer' : 'Add buyer'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Buyer name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
        </div>
        <div>
          <label className="label">Location / address</label>
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Optional" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : buyer ? 'Save changes' : 'Add buyer'}
        </button>
      </form>
    </Modal>
  );
}

function LedgerModal({ buyer, onClose }: { buyer: CustomerSummary; onClose: () => void }) {
  const currency = useDemoStore((s) => s.settings.currency);
  const [bills, setBills] = useState<CustomerBill[]>([]);
  const [state, setState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      const rows = await listCustomerBills(buyer.id);
      if (!active) return;
      setBills(rows);
      setState('ready');
    })();
    return () => { active = false; };
  }, [buyer.id]);

  // Bills are numbered 001, 002, 003… oldest first, so they read like a passbook.
  const numbered = useMemo(
    () =>
      [...bills]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((b, i) => ({ ...b, index: String(i + 1).padStart(3, '0') })),
    [bills],
  );
  const view = useMemo(() => [...numbered].reverse(), [numbered]);

  const totalBilled = numbered.reduce((n, b) => n + Number(b.total), 0);
  const unpaid = numbered
    .filter((b) => b.payment_status !== 'paid')
    .reduce((n, b) => n + Number(b.total), 0);

  return (
    <Modal open onClose={onClose} title={`${buyer.name} — ledger`}>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-neutral-50 p-2">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Bills</p>
          <p className="text-base font-bold text-neutral-800">{numbered.length}</p>
        </div>
        <div className="rounded-xl bg-success-50 p-2">
          <p className="text-[10px] uppercase tracking-wide text-success-600">Billed</p>
          <p className="text-base font-bold text-success-700">{formatCurrency(totalBilled, currency)}</p>
        </div>
        <div className={`rounded-xl p-2 ${unpaid > 0 ? 'bg-danger-50' : 'bg-neutral-50'}`}>
          <p className={`text-[10px] uppercase tracking-wide ${unpaid > 0 ? 'text-danger-500' : 'text-neutral-400'}`}>Outstanding</p>
          <p className={`text-base font-bold ${unpaid > 0 ? 'text-danger-600' : 'text-neutral-800'}`}>{formatCurrency(unpaid, currency)}</p>
        </div>
      </div>

      {(buyer.phone || buyer.location) && (
        <p className="mb-3 text-xs text-neutral-400">
          {[buyer.phone, buyer.location].filter(Boolean).join(' · ')}
        </p>
      )}

      {state === 'loading' && <Empty message="Loading this buyer's bills…" />}
      {state === 'ready' && numbered.length === 0 && <Empty message="No bills have been linked to this buyer yet." />}

      {state === 'ready' && view.length > 0 && (
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {view.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  <span className="mr-1.5 text-xs font-normal text-neutral-400">#{b.index}</span>
                  {b.receipt_no}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {new Date(b.created_at).toLocaleString()} · {b.payment_method}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-neutral-800">{formatCurrency(Number(b.total), currency)}</p>
                <p className={`text-[11px] ${b.payment_status === 'paid' ? 'text-success-600' : 'text-danger-500'}`}>{b.payment_status}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
