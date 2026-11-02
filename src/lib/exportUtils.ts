import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

let cachedLogoBase64: string | null = null;

/**
 * Loads /logo-red.png and converts to Base64 for embedding in PDFs and print views
 */
export async function getLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const response = await fetch('/logo-red.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogoBase64 = reader.result as string;
        resolve(cachedLogoBase64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Could not load logo for export:', err);
    return null;
  }
}

export interface ExportColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}

export interface ExportOptions {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  filename: string;
  orientation?: 'portrait' | 'landscape';
  summaryCards?: { label: string; value: string }[];
}

/**
 * Exports data to a branded, professional PDF with Ammamas logo on top
 */
export async function exportToPdf(options: ExportOptions): Promise<void> {
  const {
    title,
    subtitle = 'Ammamas Billing & Retail Management',
    columns,
    data,
    filename,
    orientation = 'portrait',
    summaryCards = [],
  } = options;

  try {
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 14;
    const rightMargin = pageWidth - 14;

    // Load and add Logo on top
    const logoBase64 = await getLogoBase64();
    let headerY = 12;
    if (logoBase64) {
      // 350x252 aspect ratio is ~1.39
      const logoW = 22;
      const logoH = 22 / 1.39;
      doc.addImage(logoBase64, 'PNG', leftMargin, headerY, logoW, logoH);
      
      // Brand Title next to logo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(220, 38, 38); // Primary Ammamas Red
      doc.text('AMMAMAS', leftMargin + logoW + 4, headerY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text('RETAIL & BILLING SYSTEM', leftMargin + logoW + 4, headerY + 11);
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, leftMargin + logoW + 4, headerY + 15);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(220, 38, 38);
      doc.text('AMMAMAS BILLING', leftMargin, headerY + 6);
    }

    // Right side report title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text(title, rightMargin, headerY + 6, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(subtitle, rightMargin, headerY + 11, { align: 'right' });
    doc.text(`Total Records: ${data.length}`, rightMargin, headerY + 15, { align: 'right' });

    // Red Divider Line
    let currentY = headerY + 20;
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.7);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += 5;

    // Optional summary cards
    if (summaryCards.length > 0) {
      const cardWidth = (rightMargin - leftMargin - (summaryCards.length - 1) * 3) / summaryCards.length;
      summaryCards.forEach((c, idx) => {
        const x = leftMargin + idx * (cardWidth + 3);
        doc.setFillColor(254, 242, 242); // Red-50
        doc.setDrawColor(254, 202, 202); // Red-200
        doc.roundedRect(x, currentY, cardWidth, 12, 1.5, 1.5, 'FD');
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(c.label, x + 3, currentY + 4.5);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(185, 28, 28); // Red-700
        doc.text(c.value, x + 3, currentY + 9.5);
      });
      currentY += 16;
    }

    // Format table headers and rows
    const tableHeaders = columns.map((col) => col.header);
    const tableRows = data.map((row) =>
      columns.map((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return '—';
        return String(val);
      }),
    );

    const columnStyles: Record<number, { halign?: 'left' | 'center' | 'right' }> = {};
    columns.forEach((col, idx) => {
      if (col.align) {
        columnStyles[idx] = { halign: col.align };
      }
    });

    // Render Table using autotable
    autoTable(doc, {
      startY: currentY,
      head: [tableHeaders],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [220, 38, 38], // Ammamas Red
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [255, 247, 237], // Warm Orange-50 tint
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [31, 41, 55],
        cellPadding: 2,
      },
      columnStyles,
      margin: { left: leftMargin, right: 14, bottom: 15 },
      didDrawPage: (hookData) => {
        // Page footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(
          `Ammamas Billing System · Alpha Digitronix · Page ${hookData.pageNumber}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' },
        );
      },
    });

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    doc.save(cleanFilename);
    toast.success('PDF report downloaded successfully');
  } catch (err) {
    console.error('Error generating PDF:', err);
    toast.error('Failed to generate PDF report');
  }
}

/**
 * Exports data to a clean CSV / Excel readable file with UTF-8 BOM
 */
export function exportToCsv(
  columns: { header: string; key: string }[],
  data: Record<string, unknown>[],
  filename: string,
): void {
  try {
    const headers = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key];
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(','),
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV spreadsheet downloaded');
  } catch (err) {
    console.error('CSV export error:', err);
    toast.error('Failed to export CSV');
  }
}

/**
 * Prints data table in a clean branded window
 */
export async function printReport(options: ExportOptions): Promise<void> {
  const { title, subtitle = '', columns, data, summaryCards = [] } = options;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Please allow popups to print report');
    return;
  }

  const logoBase64 = (await getLogoBase64()) || '/logo-red.png';
  const tableRowsHtml = data
    .map(
      (row, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fff7ed'};">
        ${columns
          .map(
            (col) => `
          <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: ${col.align || 'left'}; font-size: 12px; color: #1f2937;">
            ${row[col.key] ?? '—'}
          </td>
        `,
          )
          .join('')}
      </tr>
    `,
    )
    .join('');

  const summaryHtml = summaryCards.length
    ? `
      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        ${summaryCards
          .map(
            (c) => `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 14px; flex: 1;">
            <div style="font-size: 11px; color: #6b7280;">${c.label}</div>
            <div style="font-size: 15px; font-weight: bold; color: #b91c1c; margin-top: 2px;">${c.value}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    `
    : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - Ammamas</title>
        <style>
          @media print {
            body { margin: 0; padding: 15mm; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            @page { margin: 10mm; }
          }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #dc2626; color: #ffffff; padding: 10px; font-size: 12px; font-weight: 600; text-align: left; }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${logoBase64}" style="height: 48px; object-fit: contain;" />
            <div>
              <div style="font-size: 20px; font-weight: bold; color: #dc2626; line-height: 1;">AMMAMAS</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Retail POS & Billing Management</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${title}</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${subtitle || 'Report'} · ${new Date().toLocaleString('en-IN')}</div>
          </div>
        </div>
        ${summaryHtml}
        <table>
          <thead>
            <tr>
              ${columns.map((c) => `<th style="text-align: ${c.align || 'left'};">${c.header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <div style="margin-top: 20px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
          Ammamas Billing System · Generated for internal business records
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

