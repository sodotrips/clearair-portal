import jsPDF from 'jspdf';

// Brand colors
export const COLORS = {
  navy: [28, 70, 109] as [number, number, number],
  teal: [20, 184, 166] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  darkGray: [80, 80, 80] as [number, number, number],
  lightGray: [150, 150, 150] as [number, number, number],
  tableHeader: [241, 245, 249] as [number, number, number], // slate-100
  tableBorder: [203, 213, 225] as [number, number, number], // slate-300
  white: [255, 255, 255] as [number, number, number],
};

// Page dimensions (letter size in inches)
export const PAGE = {
  width: 8.5,
  height: 11,
  margin: 0.5,
  get usableWidth() { return this.width - this.margin * 2; },
  footerY: 10.5,
};

// Company info
export const COMPANY = {
  name: 'ClearAir Solutions',
  dba: 'DBA AP Solutions LLC',
  address: 'Houston, TX',
  phone: '(281) 904-4674',
  email: 'info@clearairsolutionstx.com',
  website: 'clearairsolutionstx.com',
};

export interface LineItem {
  service: string;
  description?: string;
  qty: number;
  price: number;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  depositAmount?: number;
  depositMethod?: string;
  depositDate?: string;
}

// Load logo as base64 data URL (works both client and server)
export async function loadLogoDataUrl(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined') {
      // Client-side: fetch from public folder
      const response = await fetch('/clearair-logo.png');
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      // Server-side: read file from disk
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'public', 'clearair-logo.png');
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    }
  } catch {
    return null;
  }
}

// Cached logo for reuse on subsequent pages
let _cachedLogoDataUrl: string | null = null;
let _customerAddress: string = '';

// Store customer address for continuation page headers
export function setCustomerAddress(address: string) {
  _customerAddress = address;
}

// Add company header with logo (first page — loads and caches logo)
export async function addCompanyHeader(doc: jsPDF, startY: number): Promise<number> {
  _cachedLogoDataUrl = await loadLogoDataUrl();
  let y = startY;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.text(`${COMPANY.name} (${COMPANY.dba})`, PAGE.margin, y + 0.12);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkGray);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY.address, PAGE.margin, y + 0.27);
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, PAGE.margin, y + 0.42);

  const rightX = PAGE.width - PAGE.margin;
  if (_cachedLogoDataUrl) {
    doc.addImage(_cachedLogoDataUrl, 'PNG', rightX - 1.25, y, 1.25, 0.5);
  }

  y += 0.5;

  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.03);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 0.3;

  return y;
}

// Continuation header (subsequent pages — service location + logo)
function renderContinuationHeader(doc: jsPDF, startY: number): number {
  let y = startY;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.text(`Service Location: ${_customerAddress}`, PAGE.margin, y + 0.12);

  const rightX = PAGE.width - PAGE.margin;
  if (_cachedLogoDataUrl) {
    doc.addImage(_cachedLogoDataUrl, 'PNG', rightX - 1.25, y - 0.15, 1.25, 0.5);
  }

  y += 0.35;

  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.02);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 0.2;

  return y;
}

// Add new page with continuation header
export function addNewPageWithHeader(doc: jsPDF): number {
  addFooter(doc);
  doc.addPage();
  return renderContinuationHeader(doc, PAGE.margin);
}

// Add document title badge (INVOICE or ESTIMATE)
export function addDocumentTitle(
  doc: jsPDF,
  y: number,
  title: string,
  docNumber: string,
  date: string,
  extraLines: { label: string; value: string }[]
): number {
  // Title badge (left) — teal for ESTIMATE, navy for INVOICE
  const badgeColor = title === 'ESTIMATE' ? COLORS.teal : COLORS.navy;
  doc.setFillColor(...badgeColor);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  const spaced = title.split('').join(' ');
  const textWidth = doc.getTextWidth(spaced);
  const badgeWidth = textWidth + 0.4;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(PAGE.margin, y, badgeWidth, 0.45, 0.08, 0.08, 'F');
  doc.setTextColor(...COLORS.white);
  doc.text(spaced, PAGE.margin + badgeWidth / 2, y + 0.31, { align: 'center' });

  // Document details (right)
  const rightX = PAGE.width - PAGE.margin;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.navy);
  doc.text(`${title === 'INVOICE' ? 'Invoice' : 'Estimate'} #: ${docNumber}`, rightX, y + 0.12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.darkGray);
  doc.text(`Date: ${date}`, rightX, y + 0.28, { align: 'right' });

  let detailY = y + 0.44;
  for (const line of extraLines) {
    doc.text(`${line.label}: ${line.value}`, rightX, detailY, { align: 'right' });
    detailY += 0.16;
  }

  return Math.max(y + 0.65, detailY + 0.1);
}

// Add customer info block
export function addCustomerBlock(
  doc: jsPDF,
  y: number,
  label: string,
  customer: { name: string; address: string; city: string; zip?: string; phone?: string; email?: string },
  techNotes?: string
): number {
  // Label
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.text(label, PAGE.margin, y);
  y += 0.05;

  // Calculate box height
  let customerLines = 2;
  if (customer.address) customerLines++;
  if (customer.phone) customerLines++;
  if (customer.email) customerLines++;
  const boxHeight = 0.15 + customerLines * 0.17;

  // Light background box
  doc.setFillColor(228, 253, 255); // #e4fdff
  doc.roundedRect(PAGE.margin, y, PAGE.usableWidth, boxHeight, 0.06, 0.06, 'F');

  y += 0.2;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'normal');
  doc.text(customer.name, PAGE.margin + 0.15, y);
  y += 0.16;

  doc.setTextColor(...COLORS.darkGray);
  doc.setFont('helvetica', 'normal');
  doc.text(customer.address, PAGE.margin + 0.15, y);
  y += 0.16;
  doc.text(`${customer.city}, TX${customer.zip ? ' ' + customer.zip : ''}`, PAGE.margin + 0.15, y);
  y += 0.16;
  if (customer.phone) {
    doc.text(customer.phone, PAGE.margin + 0.15, y);
    y += 0.16;
  }
  if (customer.email) {
    doc.text(customer.email, PAGE.margin + 0.15, y);
    y += 0.16;
  }

  y += 0.2;

  // Tech notes — separate block below customer info
  if (techNotes) {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.text('TECH NOTES:', PAGE.margin, y);
    y += 0.05;

    doc.setFontSize(8.5);
    const notesLines = doc.splitTextToSize(techNotes, PAGE.usableWidth - 0.3);
    const notesBoxHeight = notesLines.length * 0.15 + 0.2;

    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.005);
    doc.roundedRect(PAGE.margin, y, PAGE.usableWidth, notesBoxHeight, 0.06, 0.06, 'S');

    doc.setTextColor(...COLORS.darkGray);
    doc.setFont('helvetica', 'normal');
    let notesY = y + 0.12;
    for (const line of notesLines) {
      doc.text(line, PAGE.margin + 0.15, notesY);
      notesY += 0.15;
    }

    y += notesBoxHeight + 0.1;
  }

  return y + 0.05;
}

// Add line items table
export function addLineItemsTable(doc: jsPDF, y: number, items: LineItem[]): number {
  const numCol = 0.45;
  const colWidths = {
    num: numCol,
    service: PAGE.usableWidth - numCol - 2.0,
    qty: 0.5,
    price: 0.75,
    amount: 0.75,
  };
  const serviceNameHeight = 0.32;
  const descLineHeight = 0.16;
  const maxDescWidth = colWidths.service - 0.15;

  // Table header
  doc.setFillColor(...COLORS.navy);
  doc.rect(PAGE.margin, y, PAGE.usableWidth, 0.35, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');

  let x = PAGE.margin + 0.08;
  doc.text('TASK', x, y + 0.24);
  x = PAGE.margin + colWidths.num + 0.05;
  doc.text('SERVICE', x, y + 0.24);
  x = PAGE.margin + colWidths.num + colWidths.service;
  doc.text('QTY', x + 0.25, y + 0.24, { align: 'center' });
  x += colWidths.qty;
  doc.text('PRICE', x + colWidths.price - 0.05, y + 0.24, { align: 'right' });
  x += colWidths.price;
  doc.text('TOTAL', x + colWidths.amount - 0.05, y + 0.24, { align: 'right' });
  y += 0.35;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.darkGray);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const amount = item.qty * item.price;

    // Calculate description wrapped lines
    let descLines: string[] = [];
    if (item.description) {
      doc.setFontSize(8);
      descLines = doc.splitTextToSize(item.description, maxDescWidth);
    }
    const descHeight = descLines.length > 0 ? descLines.length * descLineHeight + 0.05 : 0;
    const totalRowHeight = serviceNameHeight + descHeight;

    // Check if we need a new page
    if (y + totalRowHeight > PAGE.footerY) {
      y = addNewPageWithHeader(doc);
    }

    // Row border (line between items)
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.005);
    doc.line(PAGE.margin, y + totalRowHeight, PAGE.width - PAGE.margin, y + totalRowHeight);

    // Item number
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.darkGray);
    doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}`, PAGE.margin + 0.15, y + 0.22, { align: 'center' });

    // Service name
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.darkGray);
    doc.setFont('helvetica', 'normal');
    doc.text(item.service, PAGE.margin + colWidths.num + 0.05, y + 0.22);

    // Description (wrapped within service column)
    if (descLines.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.lightGray);
      let descY = y + serviceNameHeight + 0.02;
      for (const line of descLines) {
        doc.text(line, PAGE.margin + colWidths.num + 0.1, descY);
        descY += descLineHeight;
      }
    }

    // Qty, Price, Amount
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.darkGray);
    doc.setFont('helvetica', 'normal');
    let cx = PAGE.margin + colWidths.num + colWidths.service;
    doc.text(item.qty.toString(), cx + 0.25, y + 0.22, { align: 'center' });
    cx += colWidths.qty;
    doc.text(`$${item.price.toFixed(2)}`, cx + colWidths.price - 0.05, y + 0.22, { align: 'right' });
    cx += colWidths.price;
    doc.text(`$${amount.toFixed(2)}`, cx + colWidths.amount - 0.05, y + 0.22, { align: 'right' });

    y += totalRowHeight;
  }

  return y + 0.35;
}

// Add totals block (right-aligned)
export function addTotalsBlock(doc: jsPDF, y: number, totals: DocumentTotals): number {
  const rightX = PAGE.width - PAGE.margin;
  const labelX = rightX - 2.2;
  const valueX = rightX - 0.1;
  const lineSpacing = 0.22;

  // Estimate total height needed
  const hasDeposit = totals.depositAmount && totals.depositAmount > 0;
  const estimatedHeight = 1.2 + (totals.discount > 0 ? 0.22 : 0) + (hasDeposit ? 1.0 : 0);
  if (y + estimatedHeight > PAGE.footerY - 0.5) {
    y = addNewPageWithHeader(doc);
  }

  // Store actual start Y for signature alignment
  (doc as any)._totalsStartY = y;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.darkGray);

  // Subtotal
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:', labelX, y, { align: 'right' });
  doc.text(`$${totals.subtotal.toFixed(2)}`, valueX, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += lineSpacing;

  // Discount (if any)
  if (totals.discount > 0) {
    doc.setTextColor(...COLORS.green);
    doc.text('Discount:', labelX, y, { align: 'right' });
    doc.text(`-$${totals.discount.toFixed(2)}`, valueX, y, { align: 'right' });
    y += lineSpacing;
    doc.setTextColor(...COLORS.darkGray);
  }

  // Tax
  doc.text(`Tax (${(totals.taxRate * 100).toFixed(2)}%):`, labelX, y, { align: 'right' });
  doc.text(`$${totals.tax.toFixed(2)}`, valueX, y, { align: 'right' });
  y += lineSpacing;

  // Divider line
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.01);
  doc.line(labelX - 0.6, y, rightX, y);
  y += 0.25;

  // Total
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.navy);
  doc.text('Total:', labelX, y, { align: 'right' });
  doc.text(`$${totals.total.toFixed(2)}`, valueX, y, { align: 'right' });
  y += lineSpacing + 0.05;

  // Deposit (if any)
  if (totals.depositAmount && totals.depositAmount > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.teal);
    doc.text('Deposit Paid:', labelX, y, { align: 'right' });
    doc.text(`-$${totals.depositAmount.toFixed(2)}`, valueX, y, { align: 'right' });
    y += lineSpacing;

    if (totals.depositMethod) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.lightGray);
      doc.text(`(${totals.depositMethod}${totals.depositDate ? ' on ' + totals.depositDate : ''})`, valueX, y, { align: 'right' });
      y += lineSpacing;
    }

    // Balance due line (same style as total divider)
    doc.setDrawColor(...COLORS.navy);
    doc.setLineWidth(0.02);
    doc.line(labelX - 0.6, y, rightX, y);
    y += 0.25;

    const balance = totals.total - totals.depositAmount;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.red);
    doc.text('Balance Due:', labelX, y, { align: 'right' });
    doc.text(`$${balance.toFixed(2)}`, valueX, y, { align: 'right' });
    y += lineSpacing + 0.05;
  }

  return y;
}

// Add PAID stamp
export function addPaidStamp(
  doc: jsPDF,
  y: number,
  amountPaid: string,
  paymentMethod: string,
  paymentDate: string
): number {
  const centerX = PAGE.width / 2;

  // Green PAID badge — centered content
  const boxHeight = 0.85;
  doc.setFillColor(220, 252, 231); // green-100
  doc.setDrawColor(...COLORS.green);
  doc.setLineWidth(0.02);
  doc.roundedRect(centerX - 1.5, y, 3, boxHeight, 0.1, 0.1, 'FD');

  const boxCenterY = y + boxHeight / 2;

  doc.setFontSize(23);
  doc.setTextColor(...COLORS.green);
  doc.setFont('helvetica', 'bold');
  doc.text('PAID', centerX, boxCenterY - 0.08, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.darkGray);
  doc.text(`$${amountPaid} via ${paymentMethod} on ${paymentDate}`, centerX, boxCenterY + 0.18, { align: 'center' });

  return y + boxHeight + 0.2;
}

// Add DEPOSIT RECEIVED stamp
export function addDepositStamp(
  doc: jsPDF,
  y: number,
  depositAmount: string,
  depositMethod: string,
  depositDate: string,
  balanceDue: string
): number {
  const centerX = PAGE.width / 2;
  // Calculate content height then center in box
  const lineGap = 0.22;
  const contentHeight = 0.16 + lineGap + lineGap; // 3 lines of text
  const padding = 0.2;
  const boxHeight = contentHeight + padding * 2;

  // Blue DEPOSIT badge
  doc.setFillColor(219, 234, 254); // blue-100
  doc.setDrawColor(37, 99, 235); // blue-600
  doc.setLineWidth(0.02);
  doc.roundedRect(centerX - 1.8, y, 3.6, boxHeight, 0.1, 0.1, 'FD');

  let textY = y + padding + 0.12;

  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('DEPOSIT RECEIVED', centerX, textY, { align: 'center' });
  textY += lineGap;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.darkGray);
  doc.text(`$${depositAmount} via ${depositMethod} on ${depositDate}`, centerX, textY, { align: 'center' });
  textY += lineGap;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.red);
  doc.text(`Balance Due: $${balanceDue}`, centerX, textY, { align: 'center' });

  return y + boxHeight + 0.2;
}

// Add AMOUNT DUE block
export function addAmountDueBlock(doc: jsPDF, y: number, total: number): number {
  const centerX = PAGE.width / 2;

  // Red AMOUNT DUE badge
  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(0.02);
  doc.roundedRect(centerX - 1.5, y, 3, 0.75, 0.1, 0.1, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(...COLORS.red);
  doc.setFont('helvetica', 'bold');
  doc.text('AMOUNT DUE', centerX, y + 0.3, { align: 'center' });
  doc.setFontSize(19);
  doc.text(`$${total.toFixed(2)}`, centerX, y + 0.58, { align: 'center' });

  y += 0.95;

  // Payment methods
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkGray);
  doc.setFont('helvetica', 'normal');
  doc.text('Payment Methods: Card, Cash, Check, Zelle', centerX, y, { align: 'center' });

  return y + 0.3;
}

// Add footer — pass docNumber to show on every page
let _footerDocNumber = '';
export function setFooterDocNumber(docNumber: string) {
  _footerDocNumber = docNumber;
}

export function addFooter(doc: jsPDF) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.lightGray);
  doc.text(`${COMPANY.name} | ${COMPANY.address} | ${COMPANY.phone}`, PAGE.width / 2, PAGE.height - 0.4, { align: 'center' });
  const pageCount = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
  doc.text(`Page ${pageCount}`, PAGE.width - PAGE.margin, PAGE.height - 0.4, { align: 'right' });
  if (_footerDocNumber) {
    doc.text(_footerDocNumber, PAGE.margin, PAGE.height - 0.4);
  }
}

// Add notes section
export function addNotesSection(doc: jsPDF, y: number, notes: string[]): number {
  if (notes.length === 0) return y;

  // no extra spacing — keep notes close to content above

  // Check if we need a new page
  if (y + 0.5 + notes.length * 0.18 > PAGE.footerY) {
    addFooter(doc);
    doc.addPage();
    y = PAGE.margin;
  }

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTES', PAGE.margin, y);
  y += 0.22;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkGray);
  doc.setFont('helvetica', 'normal');
  for (const note of notes) {
    doc.text(`• ${note}`, PAGE.margin + 0.1, y);
    y += 0.18;
  }

  return y + 0.1;
}

// Get image dimensions from data URL (works both client and server)
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    // Client-side: use Image element
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  // Server-side: parse JPEG/PNG dimensions from base64
  try {
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return Promise.resolve({ width: 800, height: 600 });
    const buffer = Buffer.from(matches[2], 'base64');
    const format = matches[1].toLowerCase();
    if (format === 'png' && buffer.length > 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return Promise.resolve({ width, height });
    }
    if ((format === 'jpeg' || format === 'jpg') && buffer.length > 2) {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return Promise.resolve({ width, height });
        }
        const segLen = buffer.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
    }
  } catch {}
  // Fallback: assume 4:3 landscape
  return Promise.resolve({ width: 800, height: 600 });
}

// Add photo section (2-column grid, 3 rows per page, fixed landscape slots)
export async function addPhotoSection(
  doc: jsPDF,
  y: number,
  title: string,
  photos: { dataUrl: string; name?: string }[]
): Promise<number> {
  if (photos.length === 0) return y;

  const colGap = 0.2;
  const rowGap = 0.2;
  const slotWidth = (PAGE.usableWidth - colGap) / 2;  // ~3.4" each
  const slotHeight = 2.4;  // fixed landscape height — fits 3 rows per page
  const rowsPerPage = 3;

  let photoIndex = 0;

  while (photoIndex < photos.length) {
    // Start new page for each batch (or first batch)
    if (photoIndex === 0) {
      // Check if heading fits
      if (y > PAGE.footerY - (slotHeight + 1)) {
        addFooter(doc);
        doc.addPage();
        y = PAGE.margin;
      }
    } else {
      y = addNewPageWithHeader(doc);
    }

    // Section heading bar
    doc.setFillColor(...COLORS.navy);
    doc.rect(PAGE.margin, y, PAGE.usableWidth, 0.35, 'F');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    const pageLabel = photos.length > rowsPerPage * 2 && photoIndex > 0
      ? `${title} (cont.)`
      : title;
    doc.text(pageLabel, PAGE.margin + 0.15, y + 0.25);
    y += 0.5;

    // Render up to 3 rows (6 photos) per page
    for (let row = 0; row < rowsPerPage && photoIndex < photos.length; row++) {
      for (let col = 0; col < 2 && photoIndex < photos.length; col++) {
        const photo = photos[photoIndex];
        const dims = await getImageDimensions(photo.dataUrl);
        const aspect = dims.width / dims.height;

        // Cover mode — fill entire slot, center image, overflow hidden
        const slotX = PAGE.margin + col * (slotWidth + colGap);
        let imgW: number, imgH: number;
        const slotAspect = slotWidth / slotHeight;

        if (aspect >= slotAspect) {
          // Image is wider — match height, overflow width
          imgH = slotHeight;
          imgW = slotHeight * aspect;
        } else {
          // Image is taller — match width, overflow height
          imgW = slotWidth;
          imgH = slotWidth / aspect;
        }

        const offsetX = slotX + (slotWidth - imgW) / 2;
        const offsetY = y + (slotHeight - imgH) / 2;

        // Use jsPDF internal API for proper clipping
        const ctx = doc.internal;
        const scaleFactor = (ctx as any).scaleFactor || 72;
        const sx = slotX * scaleFactor;
        const sy = y * scaleFactor;
        const sw = slotWidth * scaleFactor;
        const sh = slotHeight * scaleFactor;
        (doc as any).internal.write('q');
        (doc as any).internal.write(`${sx.toFixed(2)} ${(doc.internal.pageSize.getHeight() * scaleFactor - sy - sh).toFixed(2)} ${sw.toFixed(2)} ${sh.toFixed(2)} re W n`);

        // Place image (centered, overflows clipped)
        doc.addImage(photo.dataUrl, 'JPEG', offsetX, offsetY, imgW, imgH);

        // Restore clipping
        (doc as any).internal.write('Q');

        // Draw border on top
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.01);
        doc.rect(slotX, y, slotWidth, slotHeight);

        photoIndex++;
      }
      y += slotHeight + rowGap;
    }
  }

  return y;
}
