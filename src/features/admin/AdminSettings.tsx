import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { PageHeader, Badge } from '@/components/ui/admin';
import { supabase } from '@/lib/supabase';
import { CURRENT_FRONTEND_VERSION } from '@/lib/version';
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

interface VersionRow {
  latest_version: string;
  min_supported_version: string | null;
  update_title: string | null;
  release_notes: string | null;
  download_url: string | null;
  developer_contact: string | null;
  force_update: boolean | null;
  changelog: unknown;
}

/**
 * Publishes the version every other device compares itself against.
 * A device that finds a mismatch shows the "update available" notice once per
 * session, so this is the switch that tells the whole estate to update.
 */
function AppReleaseCard() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [published, setPublished] = useState('');
  const [saving, setSaving] = useState(false);

  const [latest, setLatest] = useState(CURRENT_FRONTEND_VERSION);
  const [minSupported, setMinSupported] = useState('');
  const [title, setTitle] = useState('Update Available');
  const [notes, setNotes] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [contact, setContact] = useState('');
  const [force, setForce] = useState(false);
  const [changelog, setChangelog] = useState('');

  const load = async () => {
    if (!supabase) { setState('error'); setError('The cloud server is not configured.'); return; }
    setState('loading');
    const { data, error: err } = await supabase
      .from('app_version_control')
      .select('latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog')
      .eq('id', 1)
      .maybeSingle();
    if (err) { setState('error'); setError(err.message); return; }
    const row = data as VersionRow | null;
    if (row) {
      setPublished(row.latest_version);
      setLatest(row.latest_version ?? CURRENT_FRONTEND_VERSION);
      setMinSupported(row.min_supported_version ?? '');
      setTitle(row.update_title ?? 'Update Available');
      setNotes(row.release_notes ?? '');
      setDownloadUrl(row.download_url ?? '');
      setContact(row.developer_contact ?? '');
      setForce(Boolean(row.force_update));
      setChangelog(Array.isArray(row.changelog) ? (row.changelog as string[]).join('\n') : '');
    }
    setState('ready');
  };

  useEffect(() => { void load(); }, []);

  const publish = async () => {
    if (!supabase) { toast.error('The cloud server is not configured.'); return; }
    const version = latest.trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) { toast.error('Use a version like 1.0.1'); return; }
    setSaving(true);
    try {
      const { data, error: err } = await supabase.rpc('publish_app_version', {
        p_latest_version: version,
        p_min_supported: minSupported.trim() || null,
        p_title: title.trim() || null,
        p_notes: notes.trim() || null,
        p_download_url: downloadUrl.trim() || null,
        p_force: force,
        p_changelog: changelog.split('\n').map((l) => l.trim()).filter(Boolean),
      });
      if (err) { toast.error(err.message); return; }
      if (!data) { toast.error('The server did not record the version.'); return; }
      toast.success(`Published v${version}. Devices will be asked to update on their next start.`);
      await load();
    } finally { setSaving(false); }
  };

  const mismatched = Boolean(published) && published !== CURRENT_FRONTEND_VERSION;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-700">App release &amp; update notices</h3>
        {state === 'ready' && (
          mismatched
            ? <Badge tone="warning">Published v{published} · this build v{CURRENT_FRONTEND_VERSION}</Badge>
            : <Badge tone="success">Published v{published || CURRENT_FRONTEND_VERSION} · up to date</Badge>
        )}
      </div>

      {state === 'loading' && <p className="text-sm text-neutral-400">Reading the published version…</p>}
      {state === 'error' && <p className="text-sm text-danger-600">{error}</p>}

      {state === 'ready' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Latest version</label>
              <input className="input" value={latest} onChange={(e) => setLatest(e.target.value)} placeholder="1.0.1" />
            </div>
            <div>
              <label className="label">Minimum supported</label>
              <input className="input" value={minSupported} onChange={(e) => setMinSupported(e.target.value)} placeholder="1.0.0" />
            </div>
            <div>
              <label className="label">Notice title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Download URL</label>
              <input className="input" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className="label">Developer contact</label>
              <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="support@…" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-neutral-600">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="h-4 w-4 rounded border-neutral-300 text-primary-600" />
              Block the app until it is updated
            </label>
          </div>

          <div>
            <label className="label">Notice message</label>
            <textarea rows={2} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div>
            <label className="label">What&apos;s new (one item per line)</label>
            <textarea rows={3} className="input" value={changelog} onChange={(e) => setChangelog(e.target.value)} />
          </div>

          <p className="text-xs text-neutral-400">
            Publishing does not change this app. Bump <span className="font-medium">CURRENT_FRONTEND_VERSION</span> and
            <span className="font-medium"> public/version.json</span> for the next build, then deploy — devices on older
            builds will see the update notice on their next start.
          </p>

          <div className="flex justify-end">
            <button type="button" onClick={publish} disabled={saving} className="btn-primary px-6">
              {saving ? 'Publishing…' : 'Publish version'}
            </button>
          </div>
        </>
      )}
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
      business_name: settings.business_name, phone: settings.phone ?? '', address: settings.address ?? '',
      upi_id: settings.upi_id, upi_name: settings.upi_name, tax_rate: settings.tax_rate, currency: settings.currency,
    },
  });

  const submit = (v: SettingsForm) => {
    setSaving(true);
    const patch: Partial<BusinessSettings> = {
      business_name: v.business_name.trim(),
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
          <div><label className="label">Business name</label><input className="input" {...register('business_name')} />{errors.business_name && <p className="mt-1 text-xs text-danger-600">{errors.business_name.message}</p>}</div>
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

      <div className="mt-4">
        <AppReleaseCard />
      </div>
    </div>
  );
}
