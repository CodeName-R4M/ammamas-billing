import { useEffect, useMemo, useState } from 'react';
import { UserPlus, RefreshCw, Trash2, Power, KeyRound, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Badge, Modal, Empty, StatCard } from '@/components/ui/admin';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { useDemoStore } from '@/stores/demo-store';
import { ExportButton } from '@/components/common/ExportButton';
import { formatCurrency } from '@/lib/calculations';

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'cashier';
  active: boolean;
  last_sign_in_at: string | null;
  bills_today: number;
  bills_month: number;
  bills_total: number;
  revenue_month: number;
  revenue_total: number;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'cashier';
  active: boolean;
  created_at: string;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never signed in');

/**
 * Staff accounts live in the database. Creating, deactivating, re-roling,
 * resetting passwords and deleting all go through admin-only server routines,
 * so every change is audited and nothing depends on this device.
 */
export function AdminUsers() {
  const current = useAuthStore((s) => s.user);
  const currency = useDemoStore((s) => s.settings.currency);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [resetFor, setResetFor] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!isSupabaseConfigured || !supabase) { setState('error'); setError('The cloud server is not configured.'); return; }
    setState('loading');

    // The insight routine joins profiles, auth.users and sales so the roster
    // carries last sign-in and per-cashier performance in one pass.
    const { data: overview, error: overviewErr } = await supabase.rpc('admin_staff_overview');
    if (!overviewErr && overview) {
      setStaff(
        (overview as Record<string, unknown>[]).map((r) => ({
          id: String(r.staff_id),
          email: String(r.staff_email ?? ''),
          name: String(r.staff_name ?? r.staff_email ?? 'Staff'),
          role: (r.staff_role as 'admin' | 'cashier') ?? 'cashier',
          active: Boolean(r.staff_active),
          last_sign_in_at: (r.last_sign_in_at as string | null) ?? null,
          bills_today: Number(r.bills_today ?? 0),
          bills_month: Number(r.bills_month ?? 0),
          bills_total: Number(r.bills_total ?? 0),
          revenue_month: Number(r.revenue_month ?? 0),
          revenue_total: Number(r.revenue_total ?? 0),
        })),
      );
      setState('ready');
      return;
    }

    // The insight routine may not be installed yet — fall back to the plain roster.
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, name, role, active, created_at')
      .order('created_at', { ascending: true });
    if (err) { setState('error'); setError(err.message); return; }
    setStaff(
      ((data ?? []) as ProfileRow[]).map((p) => ({
        ...p,
        last_sign_in_at: null,
        bills_today: 0,
        bills_month: 0,
        bills_total: 0,
        revenue_month: 0,
        revenue_total: 0,
      })),
    );
    setState('ready');
  };

  useEffect(() => { void load(); }, []);

  const totals = useMemo(
    () => ({
      billsToday: staff.reduce((n, s) => n + s.bills_today, 0),
      billsMonth: staff.reduce((n, s) => n + s.bills_month, 0),
      revenueMonth: staff.reduce((n, s) => n + s.revenue_month, 0),
      revenueTotal: staff.reduce((n, s) => n + s.revenue_total, 0),
    }),
    [staff],
  );

  const leader = useMemo(
    () => [...staff].sort((a, b) => b.revenue_month - a.revenue_month)[0],
    [staff],
  );

  const setRole = async (u: StaffRow, role: 'admin' | 'cashier') => {
    if (!supabase) return;
    setBusy(u.id);
    try {
      const { error: err } = await supabase.rpc('admin_set_staff_role', { p_user: u.id, p_role: role });
      if (err) { toast.error(err.message); return; }
      await load();
      toast.success(`${u.name} is now ${role === 'admin' ? 'an administrator' : 'a cashier'}`);
    } finally { setBusy(null); }
  };

  const toggleActive = async (u: StaffRow) => {
    if (!supabase) return;
    setBusy(u.id);
    try {
      const { error: err } = await supabase.rpc('admin_set_staff_active', { p_user: u.id, p_active: !u.active });
      if (err) { toast.error(err.message); return; }
      await load();
      toast.success(u.active ? `${u.name} deactivated` : `${u.name} activated`);
    } finally { setBusy(null); }
  };

  const remove = async (u: StaffRow) => {
    if (!supabase) return;
    if (!window.confirm(`Permanently delete ${u.name} (${u.email})?`)) return;
    setBusy(u.id);
    try {
      const { error: err } = await supabase.rpc('admin_delete_staff', { p_user: u.id });
      if (err) { toast.error(err.message); return; }
      await load();
      toast.success(`${u.name} deleted`);
    } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Staff accounts, performance and access control"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Staff Accounts & Performance Report',
                subtitle: `Total Users: ${staff.length} · Ammamas System Access`,
                filename: `ammamas-users-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Full Name', key: 'name' },
                  { header: 'Email Address', key: 'email' },
                  { header: 'Role', key: 'role', align: 'center' },
                  { header: 'Status', key: 'status', align: 'center' },
                  { header: 'Last Login', key: 'last' },
                  { header: 'Bills Today', key: 'billsToday', align: 'right' },
                  { header: 'Bills (Month)', key: 'billsMonth', align: 'right' },
                  { header: 'Bills (Total)', key: 'billsTotal', align: 'right' },
                  { header: `Revenue (Month, ${currency})`, key: 'revenueMonth', align: 'right' },
                ],
                data: staff.map((u) => ({
                  name: u.name,
                  email: u.email,
                  role: u.role.toUpperCase(),
                  status: u.active ? 'Active' : 'Inactive',
                  last: when(u.last_sign_in_at),
                  billsToday: u.bills_today,
                  billsMonth: u.bills_month,
                  billsTotal: u.bills_total,
                  revenueMonth: formatCurrency(u.revenue_month, currency),
                })),
                summaryCards: [
                  { label: 'Total Staff', value: String(staff.length) },
                  { label: 'Bills Today', value: String(totals.billsToday) },
                  { label: 'Revenue This Month', value: formatCurrency(totals.revenueMonth, currency) },
                ],
              }}
            />
            <button onClick={() => void load()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
            <button onClick={() => setAddOpen(true)} className="btn-primary"><UserPlus size={16} /> Add staff</button>
          </div>
        }
      />

      {/* Staff performance summary */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Bills Today" value={String(totals.billsToday)} tone="primary" />
        <StatCard label="Bills This Month" value={String(totals.billsMonth)} tone="warning" delay={0.05} />
        <StatCard label="Revenue This Month" value={formatCurrency(totals.revenueMonth, currency)} tone="success" delay={0.1} />
        <StatCard label="Lifetime Revenue" value={formatCurrency(totals.revenueTotal, currency)} tone="primary" delay={0.15} />
      </div>

      {leader && leader.revenue_month > 0 && (
        <div className="card mb-4 flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-100 text-accent-700"><Trophy size={16} /></div>
          <p className="text-sm text-neutral-600">
            Top performer this month: <span className="font-semibold text-neutral-800">{leader.name}</span> with{' '}
            <span className="font-semibold text-neutral-800">{formatCurrency(leader.revenue_month, currency)}</span> across {leader.bills_month} bills.
          </p>
        </div>
      )}

      {state === 'loading' && <Empty message="Loading staff accounts from the cloud…" />}
      {state === 'error' && <Empty message={error} />}
      {state === 'ready' && staff.length === 0 && <Empty message="No staff accounts yet." />}

      {state === 'ready' && staff.length > 0 && (
        <div className="card divide-y divide-neutral-100">
          {staff.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">{u.name[0]?.toUpperCase() ?? '?'}</div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">
                    {u.name}
                    {current?.id === u.id && <span className="ml-1 text-xs font-normal text-neutral-400">(you)</span>}
                    {!u.active && <Badge tone="danger">Disabled</Badge>}
                  </p>
                  <p className="text-xs text-neutral-400">{u.email}</p>
                  <p className="text-[11px] text-neutral-400">Last login: {when(u.last_sign_in_at)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold text-neutral-700">{u.bills_today} today · {u.bills_month} this month</p>
                  <p className="text-[11px] text-neutral-400">{formatCurrency(u.revenue_month, currency)} this month · {u.bills_total} lifetime</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input w-auto py-1.5 text-xs"
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={(e) => void setRole(u, e.target.value as 'admin' | 'cashier')}
                  >
                    <option value="cashier">Cashier</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <button onClick={() => setResetFor(u)} disabled={busy === u.id} className="btn-secondary px-2 py-1.5 text-xs" title="Reset password">
                    <KeyRound size={14} />
                  </button>
                  <button onClick={() => void toggleActive(u)} disabled={busy === u.id} className="btn-secondary px-2 py-1.5 text-xs" title={u.active ? 'Deactivate' : 'Activate'}>
                    <Power size={14} />
                  </button>
                  <button onClick={() => void remove(u)} disabled={busy === u.id} className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        Accounts with sales or activity history cannot be deleted — deactivate them instead, so past receipts stay intact.
      </p>

      {addOpen && <AddStaffModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void load(); }} />}
      {resetFor && <ResetPasswordModal staff={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function AddStaffModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_create_staff', {
        p_email: email.trim(),
        p_password: password,
        p_name: name.trim(),
        p_role: role,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Staff account created');
      onAdded();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add staff account">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input type="text" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'cashier')}>
            <option value="cashier">Cashier</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Create account'}
        </button>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    if (password.length < 8) { toast.error('Use at least 8 characters'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_reset_staff_password', { p_user: staff.id, p_password: password });
      if (error) { toast.error(error.message); return; }
      toast.success(`Password reset for ${staff.name}`);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${staff.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-neutral-500">
          Set a new password for <span className="font-medium text-neutral-700">{staff.email}</span>. Share it with the staff member and ask them to change it after signing in.
        </p>
        <div>
          <label className="label">New password</label>
          <input type="text" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
