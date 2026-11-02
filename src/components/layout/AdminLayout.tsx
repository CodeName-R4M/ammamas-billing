import { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FolderTree, Package, Boxes, ArrowLeftRight, ShoppingCart,
  CreditCard, Truck, Ticket, BarChart3, Users, Settings, LogOut, Menu,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Watermark } from '@/components/watermark/Watermark';
import { ConnectionBanner, ConnectionBadge } from '@/components/common/ConnectionStatus';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/movements', label: 'Stock Movements', icon: ArrowLeftRight },
  { to: '/admin/sales', label: 'Sales', icon: ShoppingCart },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const onLogout = () => { logout(); nav('/login', { replace: true }); };

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
        <div className="grid h-10 w-12 place-items-center rounded-xl bg-white p-1 shadow-xs border border-neutral-200">
          <img src="/logo-red.png" alt="Ammamas" className="max-h-full max-w-full object-contain" />
        </div>
        <div>
          <p className="text-sm font-bold text-neutral-900 leading-tight">Ammamas</p>
          <p className="text-xs text-primary-600 font-medium">Admin Console</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {navItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`
            }
          >
            <it.icon size={18} /> {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-neutral-100 p-3">
        <div className="mb-2 px-2"><ConnectionBadge /></div>
        <Link to="/pos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100">
          <ShoppingCart size={18} /> Open POS
        </Link>
        <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger-600 hover:bg-danger-50">
          <LogOut size={18} /> Logout
        </button>
        <p className="mt-2 px-3 text-[10px] text-neutral-300">Signed in as {user?.email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-accent-50">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-60 border-r border-neutral-200 bg-white lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-neutral-200 bg-white lg:hidden"
            >
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <ConnectionBanner />
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-3 py-2.5 backdrop-blur lg:hidden safe-top">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} className="btn-ghost rounded-lg p-2" aria-label="Menu"><Menu size={20} /></button>
            <div className="flex items-center gap-2">
              <img src="/logo-red.png" alt="Ammamas" className="h-7 w-auto object-contain" />
              <p className="font-bold text-sm text-neutral-800">Admin</p>
            </div>
          </div>
          <Link to="/pos" className="btn-ghost rounded-lg p-2 text-primary-600" aria-label="POS"><ShoppingCart size={20} /></Link>
        </header>
        <main className="w-full max-w-full p-2.5 sm:p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <Watermark variant="fixed" />
    </div>
  );
}
