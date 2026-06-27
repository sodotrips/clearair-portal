import jsPDF from 'jspdf';
import {
  PAGE,
  COLORS,
  COMPANY,
  addCompanyHeader,
  addDocumentTitle,
  addCustomerBlock,
  addLineItemsTable,
  addTotalsBlock,
  addNotesSection,
  addPhotoSection,
  addFooter,
  addNewPageWithHeader,
  setFooterDocNumber,
  setCustomerAddress,
  type LineItem,
  type DocumentTotals,
} from './pdf-shared';

export interface EstimateData {
  estimateNumber: string;
  date: string;
  validUntil: string;
  leadId: string;
  customer: {
    name: string;
    address: string;
    city: string;
    zip?: string;
    phone?: string;
    email?: string;
  };
  lineItems: LineItem[];
  totals: DocumentTotals;
  notes?: string[];
  techNotes?: string;
  photos?: { dataUrl: string; name?: string }[];
  signatureDataUrl?: string | null;
  signatureTimestamp?: string;
}

export async function generateEstimatePdf(data: EstimateData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', compress: true });
  setFooterDocNumber(`Estimate #${data.estimateNumber}`);
  setCustomerAddress(`${data.customer.address}, ${data.customer.city}, TX${data.customer.zip ? ' ' + data.customer.zip : ''}`);

  // Company header with logo
  let y = await addCompanyHeader(doc, PAGE.margin);

  // Estimate title + number/date
  y = addDocumentTitle(doc, y, 'ESTIMATE', data.estimateNumber, data.date, [
    { label: 'Valid Until', value: data.validUntil },
    { label: 'Customer ID', value: data.leadId },
  ]);

  // Customer info + tech notes
  y = addCustomerBlock(doc, y, 'PREPARED FOR:', data.customer, data.techNotes);

  // Line items table
  y = addLineItemsTable(doc, y, data.lineItems);

  // Signature (left) + Totals (right) — rendered side by side
  const totalsStartY = y;

  // Signature on the left
  if (data.signatureDataUrl) {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER SIGNATURE', PAGE.margin, y);
    y += 0.15;

    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.01);
    doc.roundedRect(PAGE.margin, y, 3.2, 0.85, 0.06, 0.06, 'S');

    try {
      doc.addImage(data.signatureDataUrl, 'PNG', PAGE.margin + 0.1, y + 0.05, 3.0, 0.6);
    } catch {
      // skip
    }

    if (data.signatureTimestamp) {
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.lightGray);
      doc.setFont('helvetica', 'normal');
      doc.text(`Signed: ${data.signatureTimestamp}`, PAGE.margin + 0.1, y + 0.78);
    }
  }

  // Totals on the right (addTotalsBlock already renders right-aligned)
  y = totalsStartY;
  y = addTotalsBlock(doc, y, { ...data.totals, depositAmount: undefined });

  // Make sure y accounts for whichever side was taller
  const signatureEndY = totalsStartY + (data.signatureDataUrl ? 1.15 : 0);
  y = Math.max(y, signatureEndY) + 0.1;

  // Disclaimer
  if (y + 0.4 > PAGE.footerY) {
    y = addNewPageWithHeader(doc);
  }
  y += 0.15;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightGray);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `This estimate is valid for 14 days from ${data.date}. Prices subject to change after expiration.`,
    PAGE.width / 2,
    y,
    { align: 'center' }
  );

  // Photos section (current condition) — always start on new page
  if (data.photos && data.photos.length > 0) {
    y = addNewPageWithHeader(doc);
    y = await addPhotoSection(doc, y, 'CURRENT CONDITION', data.photos);
  }

  // Notes section
  const defaultNotes = [
    'Price based on standard residential system inspection.',
    'Additional repairs or contamination treatment not included unless approved.',
    'This is an estimate, not an invoice. Final price may vary based on on-site conditions.',
  ];
  y = addNotesSection(doc, y, data.notes && data.notes.length > 0 ? data.notes : defaultNotes);

  // Footer
  addFooter(doc);

  return doc.output('blob');
}
