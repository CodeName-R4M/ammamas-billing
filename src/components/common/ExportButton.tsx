import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Table, Printer, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToPdf, exportToCsv, printReport, type ExportOptions } from '@/lib/exportUtils';

interface ExportButtonProps {
  options: ExportOptions;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function ExportButton({
  options,
  label = 'Export',
  className = '',
  compact = false,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handlePdf = async () => {
    setOpen(false);
    setLoading(true);
    try {
      await exportToPdf(options);
    } finally {
      setLoading(false);
    }
  };

  const handleCsv = () => {
    setOpen(false);
    exportToCsv(options.columns, options.data, options.filename);
  };

  const handlePrint = async () => {
    setOpen(false);
    await printReport(options);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading || options.data.length === 0}
        className={`btn-secondary flex items-center gap-1.5 transition ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        } ${open ? 'border-primary-400 bg-primary-50 text-primary-700' : 'hover:border-primary-300'}`}
        title={options.data.length === 0 ? 'No data to export' : 'Export data with Ammamas logo'}
      >
        <Download size={compact ? 14 : 16} className={loading ? 'animate-bounce text-primary-600' : 'text-primary-600'} />
        <span>{loading ? 'Exporting...' : label}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-1.5 w-56 origin-top-right rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl"
          >
            <div className="border-b border-neutral-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Export {options.data.length} records
            </div>

            <div className="py-1">
              <button
                type="button"
                onClick={handlePdf}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-neutral-700 transition hover:bg-primary-50 hover:text-primary-700"
              >
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-primary-100 text-primary-600">
                  <FileText size={14} />
                </div>
                <div>
                  <p className="font-semibold leading-tight">PDF Document</p>
                  <p className="text-[10px] text-neutral-400">Includes red logo &amp; header</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleCsv}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-neutral-700 transition hover:bg-accent-50 hover:text-accent-700"
              >
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent-100 text-accent-600">
                  <Table size={14} />
                </div>
                <div>
                  <p className="font-semibold leading-tight">Excel / CSV</p>
                  <p className="text-[10px] text-neutral-400">Spreadsheet ready (UTF-8)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
                  <Printer size={14} />
                </div>
                <div>
                  <p className="font-semibold leading-tight">Print Report</p>
                  <p className="text-[10px] text-neutral-400">Printer-friendly format</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

