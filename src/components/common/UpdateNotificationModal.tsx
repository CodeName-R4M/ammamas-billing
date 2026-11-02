import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, MessageSquare, X, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { checkBackendVersion, markUpdateDialogSeen, type VersionCheckResult } from '@/lib/version';

export function UpdateNotificationModal() {
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only check once on frontend start/session start
    let active = true;
    checkBackendVersion().then((res) => {
      if (!active) return;
      if (res && res.shouldNotify) {
        setResult(res);
        setOpen(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleClose = () => {
    markUpdateDialogSeen();
    setOpen(false);
  };

  const handleDownload = () => {
    markUpdateDialogSeen();
    setOpen(false);
    if (result?.info.downloadUrl) {
      window.open(result.info.downloadUrl, '_blank');
      toast.success('Redirecting to latest version download...');
    } else {
      // Force reload to bypass cache
      window.location.reload();
    }
  };

  const handleAskDeveloper = () => {
    const email = result?.info.developerContact || 'developer@alphadigitronix.in';
    const subject = encodeURIComponent(`Request for Latest Ammamas Copy (v${result?.backendVersion ?? '1.0.1'})`);
    const body = encodeURIComponent(
      `Hello Developer,\n\nI am currently using Ammamas POS v${result?.currentVersion}.\nThe app detected that a new update v${result?.backendVersion} is available.\n\nPlease provide the new APK / build copy.\n\nThank you!`
    );
    navigator.clipboard?.writeText(email);
    toast.success(`Developer contact (${email}) copied to clipboard`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  if (!open || !result) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-primary-100"
        >
          {/* Header Banner */}
          <div className="relative bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500 p-6 text-white text-center">
            {!result.info.forceUpdate && (
              <button
                onClick={handleClose}
                className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-white/80 hover:bg-white/20 transition"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            )}

            {/* Logo in rounded badge */}
            <div className="mx-auto mb-3 grid h-16 w-20 place-items-center rounded-2xl bg-white p-1.5 shadow-md">
              <img src="/logo-red.png" alt="Ammamas" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
              <Sparkles size={14} className="text-yellow-200" />
              <span>Update is available</span>
            </div>

            <h2 className="mt-2 text-xl font-bold tracking-tight">New Version Ready</h2>
            <p className="mt-1 text-xs text-white/90">
              A version mismatch between your app and the backend was found.
            </p>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-4">
            {/* Version Comparison Card */}
            <div className="flex items-center justify-between rounded-2xl bg-accent-50/60 border border-accent-200 p-3.5 text-center">
              <div className="flex-1">
                <p className="text-[11px] font-medium text-neutral-500">Your Current Copy</p>
                <p className="text-sm font-bold text-neutral-700">v{result.currentVersion}</p>
              </div>
              <div className="px-2 text-primary-600">
                <ArrowUpRight size={20} className="stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-medium text-primary-600">Latest Available</p>
                <p className="text-sm font-bold text-primary-700">v{result.backendVersion}</p>
              </div>
            </div>

            {/* Instruction Callout */}
            <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 border border-neutral-100 space-y-1.5">
              <p className="font-semibold text-neutral-800 flex items-center gap-1.5">
                <AlertCircle size={15} className="text-primary-600 shrink-0" />
                Ask the developer for new copy or download latest version
              </p>
              <p className="text-neutral-500 pl-5">
                {result.info.updateMessage ||
                  'The server has been updated with new features and improvements. Please update to ensure smooth billing and inventory sync.'}
              </p>
            </div>

            {/* Changelog highlights if available */}
            {result.info.changelog && result.info.changelog.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-neutral-700">What&apos;s new in this release:</p>
                <ul className="space-y-1 text-xs text-neutral-600 pl-1">
                  {result.info.changelog.slice(0, 4).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleDownload}
                className="btn-primary w-full py-3 text-sm font-semibold shadow-md flex items-center justify-center gap-2"
              >
                <Download size={16} />
                <span>Download Latest Version</span>
              </button>

              <button
                type="button"
                onClick={handleAskDeveloper}
                className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 hover:border-neutral-300"
              >
                <MessageSquare size={15} className="text-primary-600" />
                <span>Ask Developer for New Copy</span>
              </button>

              {!result.info.forceUpdate && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 pt-1 transition"
                >
                  Dismiss for this session
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

