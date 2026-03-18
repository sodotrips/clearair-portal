import jsPDF from 'jspdf';

export interface PhotoItem {
  id: string;
  dataUrl: string;
  name: string;
}

export interface JobInfo {
  customerName: string;
  address: string;
  city: string;
  service: string;
  date: string;
  leadId: string;
}

async function loadImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function generatePhotoPdf(
  jobInfo: JobInfo,
  beforePhotos: PhotoItem[],
  afterPhotos: PhotoItem[]
): Promise<Blob> {
  const doc = new jsPDF('portrait', 'in', 'letter');
  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.75;
  const usableWidth = pageWidth - margin * 2;
  const colGap = 0.2;
  const colWidth = (usableWidth - colGap) / 2;
  const maxImageHeight = 2.8;

  let currentY = margin;

  const addFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('ClearAir Solutions | Houston, TX', pageWidth / 2, pageHeight - 0.4, { align: 'center' });
    const pageCount = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
    doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 0.4, { align: 'right' });
  };

  // --- Header ---
  // Try loading the logo
  try {
    const logoDataUrl = await loadImageAsDataUrl('/clearair-logo.png');
    doc.addImage(logoDataUrl, 'PNG', margin, currentY, 1.43, 0.4225);
    currentY += 0.6;
  } catch {
    doc.setFontSize(22);
    doc.setTextColor(10, 37, 64);
    doc.setFont('helvetica', 'bold');
    doc.text('ClearAir Solutions', margin, currentY + 0.3);
    currentY += 0.5;
  }

  // Teal accent line
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.03);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 0.3;

  // Job info
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');

  const infoLines = [
    `Customer: ${jobInfo.customerName}`,
    `Address: ${jobInfo.address}, ${jobInfo.city}, TX`,
    `Service: ${jobInfo.service}`,
    `Date: ${jobInfo.date}`,
    `Lead ID: ${jobInfo.leadId}`,
  ];

  for (const line of infoLines) {
    doc.text(line, margin, currentY);
    currentY += 0.22;
  }
  currentY += 0.2;

  // --- Photo Sections ---
  const addPhotoSection = async (title: string, photos: PhotoItem[]) => {
    if (photos.length === 0) return;

    // Check if we need a new page for the heading
    if (currentY > pageHeight - 2) {
      addFooter();
      doc.addPage();
      currentY = margin;
    }

    // Section heading bar
    doc.setFillColor(10, 37, 64);
    doc.rect(margin, currentY, usableWidth, 0.35, 'F');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 0.15, currentY + 0.25);
    currentY += 0.55;

    // Photos in 2-column grid
    const footerMargin = 0.8;
    for (let i = 0; i < photos.length; i += 2) {
      // Calculate row height BEFORE placing images
      const leftDims = await getImageDimensions(photos[i].dataUrl);
      const leftAspect = leftDims.width / leftDims.height;
      let leftW = colWidth;
      let leftH = leftW / leftAspect;
      if (leftH > maxImageHeight) { leftH = maxImageHeight; leftW = leftH * leftAspect; }

      let rightH = 0;
      let rightW = 0;
      let rightAspect = 1;
      if (i + 1 < photos.length) {
        const rightDims = await getImageDimensions(photos[i + 1].dataUrl);
        rightAspect = rightDims.width / rightDims.height;
        rightW = colWidth;
        rightH = rightW / rightAspect;
        if (rightH > maxImageHeight) { rightH = maxImageHeight; rightW = rightH * rightAspect; }
      }

      const rowHeight = Math.max(leftH, rightH || leftH);

      // New page if this row won't fit
      if (currentY + rowHeight > pageHeight - footerMargin) {
        addFooter();
        doc.addPage();
        currentY = margin;
      }

      // Place left photo
      doc.addImage(photos[i].dataUrl, 'JPEG', margin, currentY, leftW, leftH);

      // Place right photo (if exists)
      if (i + 1 < photos.length) {
        const rightX = margin + colWidth + colGap;
        doc.addImage(photos[i + 1].dataUrl, 'JPEG', rightX, currentY, rightW, rightH);
      }

      currentY += rowHeight + 0.2;
    }

    currentY += 0.2;
  };

  await addPhotoSection('BEFORE', beforePhotos);
  await addPhotoSection('AFTER', afterPhotos);

  addFooter();

  return doc.output('blob');
}
