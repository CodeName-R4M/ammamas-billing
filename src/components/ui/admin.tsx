import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5 sm:items-end">
      <div>
        <h1 className="text-lg font-bold text-neutral-800 sm:text-xl">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'primary', delay = 0 }: {
  label: string; value: string; sub?: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; delay?: number;
}) {
  const tones: Record<string, string> = {
    primary: 'text-primary-700 bg-primary-50',
    success: 'text-success-700 bg-success-50',
    warning: 'text-warning-700 bg-warning-50',
    danger: 'text-danger-600 bg-danger-50',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-4">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-800">{value}</p>
      {sub && <p className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{sub}</p>}
    </motion.div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="card p-10 text-center text-sm text-neutral-400">{message}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary'; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: 'bg-neutral-100 text-neutral-600',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-600',
    primary: 'bg-primary-50 text-primary-700',
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl scrollbar-thin sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

import { X } from 'lucide-react';
