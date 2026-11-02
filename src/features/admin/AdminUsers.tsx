import { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, Trash2, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { ExportButton } from '@/components/common/ExportButton';

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'cashier';
  active: boolean;
}

/**
 * Staff accounts live in the database. Creating, deactivating, re-roling and
 * deleting all go through admin-only server routines, so every change is
 * audited and nothing depends on this device.
 */
export function AdminUsers() {
  const current = useAuthStore((s) => s.user);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) { setState('error'); setError('The cloud server is not configured.'); return; }
    setState('loading');
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, name, role, active')
      .order('created_at', { ascending: true });
    if (err) { setState('error'); setError(err.message); return; }
    setStaff((data ?? []) as StaffRow[]);
    setState('ready');
  };

  useEffect(() => { void load(); }, []);

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
        subtitle="Staff accounts and their permissions"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Staff Accounts & Permissions Roster',
                subtitle: `Total Users: ${staff.length} · Ammamas System Access`,
                filename: `ammamas-users-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Full Name', key: 'name' },
                  { header: 'Email Address', key: 'email' },
                  { header: 'Assigned Role', key: 'role', align: 'center' },
                  { header: 'Account Status', key: 'status', align: 'center' },
                ],
                data: staff.map((u) => ({
                  name: u.name,
                  email: u.email,
                  role: u.role.toUpperCase(),
                  status: u.active ? 'Active' : 'Inactive',
                })),
                summaryCards: [
                  { label: 'Total Staff', value: String(staff.length) },
                  { label: 'Administrators', value: String(staff.filter((u) => u.role === 'admin').length) },
                  { label: 'Cashiers', value: String(staff.filter((u) => u.role === 'cashier').length) },
                ],
              }}
            />
            <button onClick={() => void load()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
            <button onClick={() => setAddOpen(true)} className="btn-primary"><UserPlus size={16} /> Add staff</button>
          </div>
        }
      />

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
                </div>
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
                <button onClick={() => void toggleActive(u)} disabled={busy === u.id} className="btn-secondary px-2 py-1.5 text-xs" title={u.active ? 'Deactivate' : 'Activate'}>
                  <Power size={14} />
                </button>
                <button onClick={() => void remove(u)} disabled={busy === u.id} className="btn-ghost px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        Accounts with sales or activity history cannot be deleted — deactivate them instead, so past receipts stay intact.
      </p>

      {addOpen && <AddStaffModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void load(); }} />}
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
