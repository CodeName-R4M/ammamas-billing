import { motion } from 'framer-motion';

export function Splash({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-white via-accent-50 to-primary-50 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onAnimationComplete={() => setTimeout(onDone, 1200)}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <div className="grid h-24 w-28 place-items-center rounded-2xl bg-white p-2 shadow-card border border-neutral-100">
          <img src="/logo-red.png" alt="Ammamas" className="max-h-full max-w-full object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Ammamas</h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 mt-0.5">Billing &amp; Inventory</p>
        </div>
      </motion.div>
      <motion.div
        className="mt-8 h-1.5 w-36 overflow-hidden rounded-full bg-primary-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-accent-500 to-primary-600"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.0, ease: 'easeInOut' }}
        />
      </motion.div>
      <p className="absolute bottom-6 text-[10px] font-medium tracking-wider text-neutral-400">
        AMMAMAS RETAIL POS · POWERED BY ALPHA DIGITRONIX
      </p>
    </motion.div>
  );
}
