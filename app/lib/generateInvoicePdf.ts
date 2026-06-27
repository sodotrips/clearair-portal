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
  addPaidStamp,
  addDepositStamp,
  addAmountDueBlock,
  addPhotoSection,
  addFooter,
  addNewPageWithHeader,
  setFooterDocNumber,
  setCustomerAddress,
  type LineItem,
  type DocumentTotals,
} from './pdf-shared';

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
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
  techNotes?: string;
  signatureDataUrl?: string | null;
  signatureTimestamp?: string;
  photos?: { dataUrl: string; name?: string }[];
  afterPhotos?: { dataUrl: string; name?: string }[];
  // Payment info (if paid)
  isPaid: boolean;
  amountPaid?: string;
  paymentMethod?: string;
  paymentDate?: string;
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', compress: true });
  setFooterDocNumber(`Invoice #${data.invoiceNumber}`);
  setCustomerAddress(`${data.customer.address}, ${data.customer.city}, TX${data.customer.zip ? ' ' + data.customer.zip : ''}`);

  // Company header with logo
  let y = await addCompanyHeader(doc, PAGE.margin);

  // Invoice title + number/date
  y = addDocumentTitle(doc, y, 'INVOICE', data.invoiceNumber, data.date, [
    { label: 'Service Date', value: data.dueDate },
    { label: 'Customer ID', value: data.leadId },
  ]);

  // Customer info + tech notes
  y = addCustomerBlock(doc, y, 'BILL TO:', data.customer, data.techNotes);

  // Line items table
  y = addLineItemsTable(doc, y, data.lineItems);

  // Totals (includes deposit + balance if present)
  y = addTotalsBlock(doc, y, data.totals);
  const totalsStartY = (doc as any)._totalsStartY || y;

  // Payment summary when fully paid (similar to deposit layout)
  if (data.isPaid) {
    const rightX = PAGE.width - PAGE.margin;
    const labelX = rightX - 2.2;
    const valueX = rightX - 0.1;
    const lineSpacing = 0.22;

    // Amount Paid
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.green);
    doc.text('Amount Paid:', labelX, y, { align: 'right' });
    doc.text(`-$${data.amountPaid || data.totals.total.toFixed(2)}`, valueX, y, { align: 'right' });
    y += lineSpacing;

    // Payment method & date
    if (data.paymentMethod) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.lightGray);
      doc.text(`(${data.paymentMethod}${data.paymentDate ? ' on ' + data.paymentDate : ''})`, valueX, y, { align: 'right' });
      y += lineSpacing;
    }

    // Balance Due divider
    doc.setDrawColor(...COLORS.green);
    doc.setLineWidth(0.02);
    doc.line(labelX - 0.6, y, rightX, y);
    y += 0.25;

    // Balance Due: $0.00
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.green);
    doc.text('Balance Due:', labelX, y, { align: 'right' });
    doc.text('$0.00', valueX, y, { align: 'right' });
    y += 0.3;
  }

  // Customer signature — rendered on the left, parallel to totals
  if (data.signatureDataUrl) {
    const sigX = PAGE.margin + 0.5;
    const sigY = totalsStartY;
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER SIGNATURE', sigX, sigY);
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.01);
    doc.roundedRect(sigX, sigY + 0.12, 3.0, 0.85, 0.06, 0.06, 'S');
    try {
      doc.addImage(data.signatureDataUrl, 'PNG', sigX + 0.1, sigY + 0.17, 2.8, 0.6);
    } catch { /* skip */ }
    const signedDate = data.signatureTimestamp || data.date || new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.lightGray);
    doc.setFont('helvetica', 'normal');
    doc.text(`Signed: ${signedDate}`, sigX, sigY + 1.1);
  }

  const hasDeposit = data.totals.depositAmount && data.totals.depositAmount > 0;

  // Calculate how much space the stamp + thank you needs
  // Stamp: ~1.3, Thank you: ~0.5, padding: ~0.3
  const stampGroupHeight = 2.1;

  // Check if the whole group fits on current page
  if (y + stampGroupHeight > PAGE.footerY) {
    y = addNewPageWithHeader(doc);
  }

  if (data.isPaid) {
    y += 0.15;
    y = addPaidStamp(doc, y, data.amountPaid || data.totals.total.toFixed(2), data.paymentMethod || '', data.paymentDate || data.date);
  } else if (hasDeposit) {
    y += 0.15;
    const balance = (data.totals.total - data.totals.depositAmount!).toFixed(2);
    y = addDepositStamp(
      doc, y,
      data.totals.depositAmount!.toFixed(2),
      data.totals.depositMethod || '',
      data.totals.depositDate || '',
      balance,
    );
  } else {
    y += 0.15;
    y = addAmountDueBlock(doc, y, data.totals.total);
  }

  // Thank you note (guaranteed same page as stamp)
  y += 0.2;
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.teal);
  doc.setFont('helvetica', 'bold');
  doc.text('Thank you for choosing ClearAir Solutions!', PAGE.width / 2, y, { align: 'center' });
  y += 0.2;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.lightGray);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY.website, PAGE.width / 2, y, { align: 'center' });

  // Before photos section
  if (data.photos && data.photos.length > 0) {
    y = addNewPageWithHeader(doc);
    y = await addPhotoSection(doc, y, 'BEFORE — CURRENT CONDITION', data.photos);
  }

  // After photos section
  if (data.afterPhotos && data.afterPhotos.length > 0) {
    y = addNewPageWithHeader(doc);
    y = await addPhotoSection(doc, y, 'AFTER — COMPLETED WORK', data.afterPhotos);
  }


  // Footer
  addFooter(doc);

  return doc.output('blob');
}
