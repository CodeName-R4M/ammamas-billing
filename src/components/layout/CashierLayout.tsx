import { Outlet } from 'react-router-dom';
import { CartPanel } from '@/features/cart/CartPanel';
import { Watermark } from '@/components/watermark/Watermark';
import { ConnectionBanner } from '@/components/common/ConnectionStatus';

export function CashierLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-accent-50/50 w-full max-w-full overflow-x-hidden">
      <ConnectionBanner />
      <main className="flex-1 w-full max-w-full pb-36 sm:pb-40">
        <Outlet />
      </main>
      <CartPanel />
      <Watermark variant="fixed" />
    </div>
  );
}
