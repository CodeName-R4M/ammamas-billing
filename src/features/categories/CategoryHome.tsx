import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LogOut,
  ChevronRight,
  ShoppingBag,
  Shield,
  Receipt,
  LogIn,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useNetworkStore } from '@/lib/network';
import { syncCatalogFromSupabase } from '@/lib/sync';
import { Modal } from '@/components/ui/admin';

export function CategoryHome() {
  const categories = useDemoStore((s) => s.categories);
  const products = useDemoStore((s) => s.products);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const lastSync = useNetworkStore((s) => s.lastSync);
  const itemCount = useCartStore((s) => s.items.reduce((n, i) => n + i.qty, 0));
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const retrySync = async () => {
    setRetrying(true);
    try {
      const r = await syncCatalogFromSupabase();
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setRetrying(false);
    }
  };

  const productCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      if (p.active) map[p.category_id] = (map[p.category_id] ?? 0) + 1;
    }
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const active = categories.filter((c) => c.active);
    if (!q.trim()) return active;
    return active.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  }, [categories, q]);

  const onLogout = () => {
    logout();
    nav('/login', { replace: true });
  };
  const handleAdminClick = () => {
    setMenuOpen(false);
    if (user?.role === 'admin') {
      nav('/admin');
    } else {
      setAdminModalOpen(true);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-4">
      {/* Top Header - High z-index so dropdown floats above search bar */}
      <div className="relative z-30 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-11 place-items-center rounded-xl bg-white p-1 shadow-xs border border-neutral-200">
            <img src="/logo-red.png" alt="Ammamas" className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-bold text-neutral-900 leading-tight">{user?.name ?? 'Cashier'}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  user?.role === 'admin'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-accent-100 text-accent-800'
                }`}
              >
                {user?.role === 'admin' ? 'Admin' : 'Cashier'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">Ammamas Store</p>
          </div>
        </div>

        {/* Action Buttons: Direct Admin Button + Profile Menu */}
        <div className="flex items-center gap-2">
          {/* Quick Admin Navigation Button */}
          <button
            type="button"
            onClick={handleAdminClick}
            className="flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-xs transition hover:border-primary-300 hover:bg-primary-100 active:scale-95"
            title="Open Admin Dashboard"
          >
            <Shield size={14} className="text-primary-600" />
            <span>Admin</span>
          </button>

          {/* Profile Avatar & Dropdown */}
          <div className="relative z-40">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-ghost rounded-full p-1"
              aria-label="User menu"
              aria-expanded={menuOpen}
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 ring-2 ring-primary-50">
                {user?.name?.[0] ?? 'C'}
              </div>
            </button>

            {/* Backdrop overlay to close when tapped outside */}
            {menuOpen && (
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => setMenuOpen(false)}
              />
            )}

            {/* Dropdown Menu - Explicit high z-index & positioning above search */}
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl"
                >
                  {/* User Profile Summary */}
                  <div className="mb-2 border-b border-neutral-100 px-3 pb-2 pt-1">
                    <p className="text-sm font-semibold text-neutral-800">
                      {user?.name ?? 'User'}
                    </p>
                    <p className="line-clamp-1 text-xs text-neutral-400">{user?.email}</p>
                    <span className="mt-1 inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                      {user?.role === 'admin' ? 'Administrator' : 'Cashier'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="space-y-0.5">
                    {/* Admin Portal / Switch */}
                    <button
                      type="button"
                      onClick={handleAdminClick}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-primary-700 transition hover:bg-primary-50"
                    >
                      <Shield size={15} className="text-primary-600" />
                      <span>
                        {user?.role === 'admin' ? 'Open Admin Console' : 'Sign in as Admin'}
                      </span>
                    </button>

                    {/* Sales History */}
                    <Link
                      to="/pos/history"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      <Receipt size={15} className="text-neutral-500" />
                      <span>Transaction History</span>
                    </Link>

                    {/* Logout */}
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-danger-600 transition hover:bg-danger-50"
                    >
                      <LogOut size={15} />
                      <span>Logout</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Search Bar - Lower z-index so dropdown is never covered */}
      <div className="relative z-10 mb-5">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          className="input pl-10"
          placeholder="Search categories..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {itemCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-xs font-medium text-primary-700">
          <span className="flex items-center gap-1.5">
            <ShoppingBag size={15} />
            {itemCount} item{itemCount > 1 ? 's' : ''} in current bill
          </span>
          <Link to="/pos/checkout" className="font-semibold underline hover:text-primary-900">
            View bill
          </Link>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Categories</h2>
        <span className="text-xs text-neutral-400">{filtered.length} available</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="text-sm font-medium text-neutral-600">No categories available.</p>
          <p className="text-xs text-neutral-400">
            {lastSync && !lastSync.success
              ? lastSync.message
              : lastSync?.success
              ? 'The cloud catalog is empty. Add categories from the Admin console.'
              : 'Loading data from the cloud...'}
          </p>
          <button
            type="button"
            onClick={retrySync}
            disabled={retrying}
            className="btn-secondary mx-auto flex items-center gap-2 px-4 py-2 text-xs"
          >
            <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
            {retrying ? 'Syncing...' : 'Retry cloud sync'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <Link
                to={`/pos/category/${c.id}`}
                className="card group flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                {/* Visual Category Cover Image Banner */}
                <div className="relative flex h-28 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary-50 to-primary-100 sm:h-32">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}

                  {/* Fallback avatar if no image or image failed */}
                  {!c.image_url && (
                    <div className="flex flex-col items-center gap-1 text-primary-400">
                      <span className="text-3xl font-bold">{c.name[0]}</span>
                    </div>
                  )}

                  {/* Gradient scrim for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-40" />

                  {/* Product count badge overlay */}
                  <div className="absolute bottom-2 left-2.5">
                    <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {productCount[c.id] ?? 0} items
                    </span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="flex flex-1 flex-col justify-between p-3">
                  <div>
                    <p className="font-semibold text-neutral-800 transition group-hover:text-primary-700">
                      {c.name}
                    </p>
                    {c.description && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-primary-600">
                    <span className="text-[11px] font-medium">Open catalog</span>
                    <ChevronRight size={15} className="transition group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Admin Switch / Login Modal */}
      <AdminAuthModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onSuccess={() => {
          setAdminModalOpen(false);
          nav('/admin');
        }}
      />
    </div>
  );
}

function AdminAuthModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('admin.alphadigitronix@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleQuickAdmin = () => {
    setEmail('admin.alphadigitronix@gmail.com');
    toast('Enter the administrator password to continue', { icon: '🔐' });
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      // The role is decided by the staff profile in the cloud, not by this form.
      const res = await signIn(email.trim(), password);
      if (!res.ok || !res.user) {
        toast.error(res.message);
        return;
      }
      if (res.user.role !== 'admin') {
        toast.error('This account is not an administrator.');
        return;
      }
      toast.success('Welcome to Admin Portal!');
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Admin Authentication">
      <div className="space-y-4">
        <p className="text-xs text-neutral-500">
          Administrator privileges are required to manage inventory, catalog, categories, staff,
          and view sales reports.
        </p>

        {/* Prefill the administrator email — the password is still required. */}
        <button
          type="button"
          onClick={handleQuickAdmin}
          className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold"
        >
          <KeyRound size={16} /> Use administrator account
        </button>

        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-neutral-200" />
          <span className="absolute bg-white px-2 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            Or sign in with admin credentials
          </span>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-3">
          <div>
            <label className="label">Admin Email</label>
            <input
              type="email"
              className="input text-xs"
              placeholder="admin.alphadigitronix@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input text-xs"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-secondary flex w-full items-center justify-center gap-2 py-2 text-xs"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600/30 border-t-primary-600" />
            ) : (
              <>
                <LogIn size={14} /> Authenticate & Open Admin Console
              </>
            )}
          </button>
        </form>
      </div>
    </Modal>
  );
}
