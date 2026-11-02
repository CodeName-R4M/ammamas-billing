import { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Server,
  Info,
  Activity,
  Globe,
} from 'lucide-react';
import { useNetworkStore, type DiagnosticsResult } from '@/lib/network';
import { syncCatalogFromSupabase } from '@/lib/sync';
import { useDemoStore } from '@/stores/demo-store';
import { Modal } from '@/components/ui/admin';
import toast from 'react-hot-toast';

export function ConnectionBanner() {
  const { state, statusMessage, errorDetail, lastSync, checkConnection } = useNetworkStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [diag, setDiag] = useState<DiagnosticsResult | null>(null);
  const [testing, setTesting] = useState(false);

  const syncFailed = Boolean(lastSync && !lastSync.success);
  const cloudEmpty = Boolean(
    lastSync?.success && lastSync.productsCount === 0 && lastSync.categoriesCount === 0,
  );
  const unsyncedProducts = lastSync?.localOnlyProducts ?? 0;
  const unsyncedCategories = lastSync?.localOnlyCategories ?? 0;
  const unsyncedTotal = unsyncedProducts + unsyncedCategories;

  useEffect(() => {
    checkConnection().then(setDiag);

    const handleOnline = () => {
      checkConnection().then(setDiag);
      toast.success('Internet connection restored!');
    };
    const handleOffline = () => {
      checkConnection().then(setDiag);
      toast.error('Device is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await checkConnection();
      setDiag(res);
      const syncRes = await syncCatalogFromSupabase();
      if (res.reachable && syncRes.success) {
        toast.success(syncRes.message);
      } else if (!res.isOnline) {
        toast.error('No internet connection on device');
      } else {
        toast.error(res.statusMessage);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleClearCache = () => {
    if (confirm('Clear all local items to start fresh from cloud data?')) {
      useDemoStore.getState().clearAllData();
      toast.success('Local cache cleared');
      runTest();
    }
  };

  return (
    <>
      {/* Subtle bar while the first health check runs */}
      {state === 'checking' && (
        <div className="flex items-center gap-2 bg-neutral-200 px-4 py-1.5 text-[11px] font-medium text-neutral-600">
          <RefreshCw size={12} className="animate-spin" />
          <span>Checking server connection...</span>
        </div>
      )}

      {/* Banner when offline */}
      {state === 'no_internet' && (
        <div
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center justify-between bg-danger-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-danger-700"
        >
          <div className="flex items-center gap-2">
            <WifiOff size={15} />
            <span>NO INTERNET CONNECTION — App is operating in offline mode.</span>
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            Tap for status
          </span>
        </div>
      )}

      {/* Banner when server is unreachable / not configured */}
      {state === 'server_unreachable' && (
        <div
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center justify-between bg-warning-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-warning-600 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <CloudOff size={15} />
            <span className="font-semibold">
              SERVER UNAVAILABLE — cloud data could not be reached. Showing locally stored items.
            </span>
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            Check details
          </span>
        </div>
      )}

      {/* Banner when the server is reachable but the catalog sync failed */}
      {state === 'connected' && syncFailed && (
        <div
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center justify-between bg-warning-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-warning-600 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span className="font-semibold">
              CLOUD SYNC FAILED — showing locally stored items only. Tap for details.
            </span>
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            Check details
          </span>
        </div>
      )}

      {/* Banner when the server returned an empty catalog */}
      {state === 'connected' && !syncFailed && cloudEmpty && (
        <div
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center justify-between bg-primary-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-primary-700"
        >
          <div className="flex items-center gap-2">
            <Info size={15} />
            <span className="font-semibold">
              CLOUD CATALOG IS EMPTY — server is reachable but returned 0 products & 0 categories.
            </span>
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            Check details
          </span>
        </div>
      )}

      {/* Banner when this device holds items the cloud never received */}
      {state === 'connected' && !syncFailed && unsyncedTotal > 0 && (
        <div
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center justify-between bg-primary-700 px-4 py-2 text-xs font-medium text-white transition hover:bg-primary-800"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span className="font-semibold">
              DEVICES OUT OF SYNC — {unsyncedTotal} item(s) exist only on this device and were never uploaded
              to the cloud.
            </span>
          </div>
          <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            Check details
          </span>
        </div>
      )}

      {/* Diagnostics Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Server & Network Diagnostics">
        <div className="space-y-4">
          {/* Status Overview Card */}
          <div
            className={`rounded-2xl p-4 border ${
              state === 'connected'
                ? 'bg-success-50 border-success-200 text-success-800'
                : state === 'no_internet'
                ? 'bg-danger-50 border-danger-200 text-danger-800'
                : 'bg-warning-50 border-warning-200 text-warning-800'
            }`}
          >
            <div className="flex items-center gap-2.5 font-bold text-sm">
              {state === 'connected' && <CheckCircle2 size={18} className="text-success-600" />}
              {state === 'no_internet' && <WifiOff size={18} className="text-danger-600" />}
              {state === 'server_unreachable' && <AlertTriangle size={18} className="text-warning-600" />}
              <span>{statusMessage}</span>
            </div>
            {errorDetail && (
              <p className="mt-2 text-xs opacity-90 leading-relaxed font-mono bg-white/70 p-2 rounded-lg break-words">
                {errorDetail}
              </p>
            )}
          </div>

          {/* Diagnostic Info List */}
          <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 text-xs bg-neutral-50/50">
            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Wifi size={14} /> Device Internet:
              </span>
              <span className={`font-semibold ${diag?.isOnline ? 'text-success-600' : 'text-danger-600'}`}>
                {diag?.isOnline ? 'Connected (Online)' : 'Disconnected (Offline)'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Activity size={14} /> Internet Ping (Step 1):
              </span>
              <span
                className={`font-semibold ${
                  !diag ? 'text-neutral-400' : diag.internetReachable ? 'text-success-600' : 'text-danger-600'
                }`}
              >
                {!diag
                  ? 'Testing…'
                  : diag.internetReachable
                  ? `OK — ${diag.internetTarget} (${diag.internetMs} ms)`
                  : `FAILED — ${diag.internetTried.join(', ')}`}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Globe size={14} /> Supabase DNS (Step 2):
              </span>
              <span
                className={`font-semibold ${
                  diag?.dnsResolves === true
                    ? 'text-success-600'
                    : diag?.dnsResolves === false
                    ? 'text-danger-600'
                    : 'text-neutral-400'
                }`}
              >
                {diag?.dnsResolves === true
                  ? 'Resolves'
                  : diag?.dnsResolves === false
                  ? 'Does NOT resolve'
                  : 'Unknown'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Server size={14} /> Supabase Host:
              </span>
              <span className="font-mono text-neutral-800 text-[11px] truncate max-w-[200px]">
                {diag?.supabaseUrl ? new URL(diag.supabaseUrl).hostname : 'Not configured'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Cloud size={14} /> Cloud Catalog:
              </span>
              <span className="font-semibold text-neutral-800">
                {diag?.reachable
                  ? `${diag.productsInCloud ?? 0} products / ${diag.categoriesInCloud ?? 0} categories`
                  : 'Unavailable'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500">Local Stored Items:</span>
              <span className="font-semibold text-neutral-800">
                {diag?.localProductsCount ?? 0} products / {diag?.localCategoriesCount ?? 0} categories
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500">Last Cloud Sync:</span>
              <span className={`font-semibold ${lastSync ? (lastSync.success ? 'text-success-600' : 'text-warning-600') : 'text-neutral-400'}`}>
                {lastSync
                  ? lastSync.success
                    ? `OK · ${lastSync.productsCount} products / ${lastSync.categoriesCount} categories`
                    : 'FAILED — local data only'
                  : 'Not attempted yet'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3">
              <span className="text-neutral-500">Unsynced (device only):</span>
              <span className={`font-semibold ${unsyncedTotal > 0 ? 'text-warning-600' : 'text-success-600'}`}>
                {lastSync
                  ? `${unsyncedProducts} products / ${unsyncedCategories} categories`
                  : 'Unknown'}
              </span>
            </div>
          </div>

          {lastSync?.success && unsyncedTotal > 0 && (
            <div className="rounded-xl bg-primary-50 p-3 text-xs text-primary-800 border border-primary-100">
              <p className="font-bold mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} /> This device and the cloud disagree
              </p>
              <p className="text-[11px] leading-relaxed">
                {unsyncedProducts} product(s) and {unsyncedCategories} category(ies) exist here but not in
                Supabase — they were saved locally because the cloud write was rejected, so other devices will
                never see them. Cloud write permission is the missing piece (the database only allows writes
                from signed-in staff).
              </p>
            </div>
          )}

          {lastSync && !lastSync.success && (
            <div className="rounded-xl bg-warning-50 p-3 text-xs text-warning-800 border border-warning-200">
              <p className="font-bold mb-1">Cloud sync message</p>
              <p className="text-[11px] leading-relaxed break-words font-mono">{lastSync.message}</p>
              <p className="mt-1 text-[11px] text-neutral-600">
                The app is showing locally stored items. Tap “Test Connection &amp; Sync from Server” to retry.
              </p>
            </div>
          )}

          {/* Accurate cause: server up but reads blocked, vs. server unreachable */}
          {state === 'server_unreachable' && (
            <div className="rounded-xl bg-primary-50 p-3 text-xs text-primary-800 border border-primary-100">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <Info size={14} />{' '}
                {diag?.reachable ? 'Server is up, but reads are blocked' : 'Why can’t the app reach the server?'}
              </p>
              {diag?.reachable ? (
                <>
                  <p className="text-[11px] leading-relaxed text-neutral-600">
                    Supabase answered (HTTP {diag.statusCode}), so the project is <span className="font-semibold">not paused</span>.
                    The anonymous key this app uses is simply not allowed to read the catalog tables — the
                    database only grants reads to signed-in staff, so the app gets “permission denied” and
                    shows local items only.
                  </p>
                  <p className="mt-1.5 text-[11px] text-neutral-700">
                    Fix: run <span className="font-mono text-primary-700">supabase/sql/0006_allow_anon_read.sql</span>{' '}
                    in the Supabase SQL editor to allow read-only access for the app key.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] leading-relaxed text-neutral-600">
                    {diag?.possibleReason ??
                      'The device could not open a connection to Supabase. This is a network problem, not a database problem.'}
                  </p>
                  <ol className="list-decimal list-inside mt-1.5 text-[11px] space-y-1 text-neutral-700">
                    <li>Confirm the device has real internet (mobile data / VPN / firewall can block it).</li>
                    <li>
                      Confirm the project is active at{' '}
                      <span className="font-semibold">supabase.com/dashboard</span>.
                    </li>
                  </ol>
                </>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={testing}
              onClick={runTest}
              className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold"
            >
              <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
              {testing ? 'Testing connection & syncing...' : 'Test Connection & Sync from Server'}
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-200 bg-white py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition"
            >
              <Trash2 size={14} /> Clear Local Stored Items
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Clickable pill badge for headers to quickly show connection health
 */
export function ConnectionBadge() {
  const { state, lastSync, checkConnection } = useNetworkStore();
  const [modalOpen, setModalOpen] = useState(false);

  const syncFailed = Boolean(lastSync && !lastSync.success);
  const degraded = state === 'connected' && syncFailed;

  const tone = state === 'connected' && !syncFailed
    ? 'bg-success-50 text-success-700 border border-success-200'
    : state === 'no_internet'
    ? 'bg-danger-50 text-danger-700 border border-danger-200'
    : 'bg-warning-50 text-warning-700 border border-warning-200';

  const dot = state === 'connected' && !syncFailed
    ? 'bg-success-500 animate-pulse'
    : state === 'no_internet'
    ? 'bg-danger-500'
    : 'bg-warning-500';

  const label = state === 'connected'
    ? degraded ? 'Sync Failed' : 'Cloud Live'
    : state === 'no_internet'
    ? 'No Internet'
    : 'Server Offline';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          checkConnection();
          setModalOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition shadow-xs ${tone}`}
        title="Check Server & Internet Status"
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span>{label}</span>
      </button>

      <ConnectionBannerModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function ConnectionBannerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, statusMessage, errorDetail, lastSync, checkConnection } = useNetworkStore();
  const [testing, setTesting] = useState(false);
  const [diag, setDiag] = useState<DiagnosticsResult | null>(null);

  useEffect(() => {
    if (open) {
      checkConnection().then(setDiag);
    }
  }, [open, checkConnection]);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await checkConnection();
      setDiag(res);
      const sync = await syncCatalogFromSupabase();
      if (res.reachable && sync.success) {
        toast.success(sync.message);
      } else {
        toast.error(res.statusMessage);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleClear = () => {
    if (confirm('Clear all local items to start fresh from cloud data?')) {
      useDemoStore.getState().clearAllData();
      toast.success('Local cache cleared');
      handleTest();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Server & Connection Status">
      <div className="space-y-4">
        <div
          className={`rounded-2xl p-4 border ${
            state === 'connected'
              ? 'bg-success-50 border-success-200 text-success-800'
              : state === 'no_internet'
              ? 'bg-danger-50 border-danger-200 text-danger-800'
              : 'bg-warning-50 border-warning-200 text-warning-800'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            {state === 'connected' && <CheckCircle2 size={18} className="text-success-600" />}
            {state === 'no_internet' && <WifiOff size={18} className="text-danger-600" />}
            {state === 'server_unreachable' && <AlertTriangle size={18} className="text-warning-600" />}
            <span>{statusMessage}</span>
          </div>
          {errorDetail && (
            <p className="mt-2 text-xs font-mono bg-white/70 p-2 rounded-lg break-words text-neutral-700">
              {errorDetail}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 text-xs bg-neutral-50/50">
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Device Internet:</span>
            <span className={`font-semibold ${diag?.isOnline ? 'text-success-600' : 'text-danger-600'}`}>
              {diag?.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Internet Ping:</span>
            <span
              className={`font-semibold ${
                !diag ? 'text-neutral-400' : diag.internetReachable ? 'text-success-600' : 'text-danger-600'
              }`}
            >
              {!diag
                ? 'Testing…'
                : diag.internetReachable
                ? `OK — ${diag.internetTarget} (${diag.internetMs} ms)`
                : `FAILED — ${diag.internetTried.join(', ')}`}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Supabase DNS:</span>
            <span
              className={`font-semibold ${
                diag?.dnsResolves === true
                  ? 'text-success-600'
                  : diag?.dnsResolves === false
                  ? 'text-danger-600'
                  : 'text-neutral-400'
              }`}
            >
              {diag?.dnsResolves === true ? 'Resolves' : diag?.dnsResolves === false ? 'Does NOT resolve' : 'Unknown'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Supabase Host:</span>
            <span className="font-mono text-neutral-800 text-[11px] truncate max-w-[200px]">
              {diag?.supabaseUrl ? new URL(diag.supabaseUrl).hostname : 'Not configured'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Items in Cloud:</span>
            <span className="font-semibold text-neutral-800">
              {diag?.reachable
                ? `${diag.productsInCloud ?? 0} products / ${diag.categoriesInCloud ?? 0} categories`
                : 'Unavailable'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Local Stored Items:</span>
            <span className="font-semibold text-neutral-800">
              {diag?.localProductsCount ?? 0} products / {diag?.localCategoriesCount ?? 0} categories
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <span className="text-neutral-500">Last Cloud Sync:</span>
            <span className={`font-semibold ${lastSync ? (lastSync.success ? 'text-success-600' : 'text-warning-600') : 'text-neutral-400'}`}>
              {lastSync ? (lastSync.success ? 'OK' : 'FAILED — local data only') : 'Not attempted yet'}
            </span>
          </div>
        </div>

        {state === 'server_unreachable' && (
          <div className="rounded-xl bg-primary-50 p-3 text-xs text-primary-800 border border-primary-100">
            <p className="font-bold flex items-center gap-1 mb-1">
              <Info size={14} />
              {diag?.reachable ? 'Server up — reads blocked:' : 'Server unreachable:'}
            </p>
            <p className="text-[11px] text-neutral-600">
              {diag?.reachable
                ? 'Supabase answered normally. The app key (anon) is not permitted to read the catalog tables, so cloud items cannot be shown. Run supabase/sql/0006_allow_anon_read.sql to grant read-only access.'
                : diag?.possibleReason ??
                  'The device could not reach Supabase. Check the network (mobile data / VPN / firewall) and that the project is active at supabase.com/dashboard.'}
            </p>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={testing}
            onClick={handleTest}
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold"
          >
            <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
            {testing ? 'Checking connection...' : 'Test Connection & Sync'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-200 bg-white py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition"
          >
            <Trash2 size={14} /> Clear Local Stored Items
          </button>
        </div>
      </div>
    </Modal>
  );
}
