import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Smartphone, Server, CalendarDays, ShieldCheck, ArrowUpCircle } from 'lucide-react';
import { useDemoStore } from '@/stores/demo-store';
import { PageHeader } from '@/components/ui/admin';
import { APP_NAME } from '@/lib/brand';
import { APP_VERSION, BACKEND_VERSION, APP_BUILD_DATE, isAppOutdated } from '@/lib/version';
import type { BusinessSettings } from '@/types';

const schema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required'),
  phone: z.string(),
  address: z.string(),
  upi_id: z.string().trim().regex(/^[\w.-]{2,}@[A-Za-z]{2,}$/, 'Enter a valid UPI ID, e.g. shop@bank'),
  upi_name: z.string().trim().min(1, 'Merchant display name is required'),
  tax_rate: z.number({ error: 'Enter a rate' }).min(0, 'Must be 0 or more').max(100, 'Must be 100 or less'),
  currency: z.string().trim().min(1, 'Currency symbol is required').max(3),
});
type SettingsForm = z.infer<typeof schema>;

function VersionStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-primary-600 shadow-sm">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
        <p className="truncate text-sm font-bold text-neutral-800">{value}</p>
      </div>
    </div>
  );
}

export function AdminSettings() {
  const settings = useDemoStore((s) => s.settings);
  const updateSettings = useDemoStore((s) => s.updateSettings);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<SettingsForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: APP_NAME, phone: settings.phone ?? '', address: settings.address ?? '',
      upi_id: settings.upi_id, upi_name: settings.upi_name, tax_rate: settings.tax_rate, currency: settings.currency,
    },
  });

  const submit = (v: SettingsForm) => {
    setSaving(true);
    const patch: Partial<BusinessSettings> = {
      // The shop name is hardcoded in code and printed on every receipt.
      business_name: APP_NAME,
      phone: v.phone.trim() || null,
      address: v.address.trim() || null,
      upi_id: v.upi_id.trim(),
      upi_name: v.upi_name.trim(),
      tax_rate: v.tax_rate,
      currency: v.currency.trim(),
    };
    updateSettings(patch);
    setSaving(false);
    toast.success('Settings saved');
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business details printed on receipts and used for UPI payments" />
      <form onSubmit={handleSubmit(submit)} className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h3 className="text-sm font-semibold text-neutral-700">Business details</h3>
          <div>
            <label className="label">Business name</label>
            <input className="input bg-neutral-50 text-neutral-500" value={APP_NAME} readOnly />
            <p className="mt-1 text-xs text-neutral-400">Fixed in code and printed on every receipt.</p>
          </div>
          <div><label className="label">Phone</label><input className="input" {...register('phone')} /></div>
          <div><label className="label">Address</label><textarea rows={2} className="input" {...register('address')} /></div>
        </div>
        <div className="card space-y-3 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">UPI payments</h3>
          <div><label className="label">UPI ID</label><input className="input" {...register('upi_id')} />{errors.upi_id && <p className="mt-1 text-xs text-danger-600">{errors.upi_id.message}</p>}</div>
          <div><label className="label">Merchant display name</label><input className="input" {...register('upi_name')} />{errors.upi_name && <p className="mt-1 text-xs text-danger-600">{errors.upi_name.message}</p>}</div>
          <p className="text-xs text-neutral-400">The QR code encodes this UPI ID and the bill amount. Scanning it does not confirm payment.</p>
        </div>
        <div className="card space-y-3 p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-neutral-700">Tax and currency</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Tax rate (%)</label><input type="number" step="0.01" className="input" {...register('tax_rate', { valueAsNumber: true })} />{errors.tax_rate && <p className="mt-1 text-xs text-danger-600">{errors.tax_rate.message}</p>}</div>
            <div><label className="label">Currency symbol</label><input className="input" {...register('currency')} />{errors.currency && <p className="mt-1 text-xs text-danger-600">{errors.currency.message}</p>}</div>
          </div>
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" disabled={!isDirty || saving} className="btn-primary px-6">Save settings</button>
        </div>
      </form>

      <div className="card mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">Version &amp; build</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              Set in the .env file by the developer. Read-only — not editable by admin or cashier.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-500">
            <ShieldCheck size={13} />
            Developer-managed
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <VersionStat icon={<Smartphone size={17} />} label="Application version" value={`v${APP_VERSION}`} />
          <VersionStat icon={<Server size={17} />} label="Backend version" value={`v${BACKEND_VERSION}`} />
          <VersionStat icon={<CalendarDays size={17} />} label="Build date" value={APP_BUILD_DATE} />
        </div>

        {isAppOutdated(BACKEND_VERSION) && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700">
            <ArrowUpCircle size={14} className="shrink-0" />
            A newer build is available. Update the app so billing and inventory stay in sync with the server.
          </p>
        )}
      </div>
    </div>
  );
}
