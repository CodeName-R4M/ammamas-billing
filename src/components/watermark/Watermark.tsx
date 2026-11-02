import { motion } from 'framer-motion';

export function Watermark({ variant = 'footer' }: { variant?: 'footer' | 'fixed' }) {
  const base = 'PROVIDED BY ALPHA DIGITRONIX SOLUTION';
  if (variant === 'fixed') {
    return (
      <div className="pointer-events-none fixed bottom-1 right-2 z-40 select-none">
        <span className="text-[9px] font-medium tracking-wide text-primary-300/60">{base}</span>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pointer-events-none select-none text-center py-2"
    >
      <span className="text-[10px] font-medium tracking-wider text-neutral-400">{base}</span>
    </motion.div>
  );
}
