import { lazy, Suspense, useState, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth-store';
import { syncCatalogFromSupabase } from '@/lib/sync';
import { Splash } from '@/features/auth/Splash';
import { Login } from '@/features/auth/Login';
import { CashierLayout } from '@/components/layout/CashierLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CategoryHome } from '@/features/categories/CategoryHome';
import { UpdateNotificationModal } from '@/components/common/UpdateNotificationModal';

const page = <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const ProductListing = page(() => import('@/features/products/ProductListing'), 'ProductListing');
const Checkout = page(() => import('@/features/checkout/Checkout'), 'Checkout');
const Payment = page(() => import('@/features/payments/Payment'), 'Payment');
const Receipt = page(() => import('@/features/receipts/Receipt'), 'Receipt');
const TransactionHistory = page(() => import('@/features/sales/TransactionHistory'), 'TransactionHistory');
const AdminDashboard = page(() => import('@/features/admin/Dashboard'), 'AdminDashboard');
const AdminCategories = page(() => import('@/features/admin/AdminCategories'), 'AdminCategories');
const AdminProducts = page(() => import('@/features/admin/AdminProducts'), 'AdminProducts');
const AdminInventory = page(() => import('@/features/admin/AdminInventory'), 'AdminInventory');
const AdminMovements = page(() => import('@/features/admin/AdminInventory'), 'AdminMovements');
const AdminSales = page(() => import('@/features/admin/AdminSales'), 'AdminSales');
const AdminPayments = page(() => import('@/features/admin/AdminSales'), 'AdminPayments');
const AdminSuppliers = page(() => import('@/features/admin/AdminSuppliersCoupons'), 'AdminSuppliers');
const AdminCoupons = page(() => import('@/features/admin/AdminSuppliersCoupons'), 'AdminCoupons');
const AdminReports = page(() => import('@/features/admin/AdminReports'), 'AdminReports');
const AdminUsers = page(() => import('@/features/admin/AdminUsers'), 'AdminUsers');
const AdminSettings = page(() => import('@/features/admin/AdminSettings'), 'AdminSettings');

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>
  );
}

function RequireAuth({ role, children }: { role?: 'admin'; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  // Wait for the persisted session to be checked before deciding, or a page
  // reload would bounce a signed-in cashier back to the login screen.
  if (!ready) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splash-seen'));

  useEffect(() => {
    useAuthStore.getState().restoreSession();
    syncCatalogFromSupabase();
  }, []);

  const finishSplash = () => {
    sessionStorage.setItem('splash-seen', '1');
    setShowSplash(false);
  };

  return (
    <BrowserRouter>
      <AnimatePresence>{showSplash && <Splash key="splash" onDone={finishSplash} />}</AnimatePresence>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/login" element={<Login />} />

          <Route path="/pos" element={<RequireAuth><CashierLayout /></RequireAuth>}>
            <Route index element={<CategoryHome />} />
            <Route path="category/:categoryId" element={<ProductListing />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="payment" element={<Payment />} />
            <Route path="receipt/:saleId" element={<Receipt />} />
            <Route path="history" element={<TransactionHistory />} />
          </Route>

          <Route path="/admin" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
            <Route index element={<AdminDashboard />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="movements" element={<AdminMovements />} />
            <Route path="sales" element={<AdminSales />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="suppliers" element={<AdminSuppliers />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </Suspense>
      {/* Backend/frontend version mismatch notice — checked once per app session */}
      <UpdateNotificationModal />
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '12px', fontSize: '14px' } }} />
    </BrowserRouter>
  );
}
