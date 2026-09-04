import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToWords } from '../utils/billing';
import { api, BASE_URL } from './api';
import { invoiceAssets } from '../assets/invoice/invoiceAssets';

/**
 * Build a unique, descriptive filename for an invoice PDF.
 * Format: CustomerName_INV-XXXX_28-Aug-2026_1350.pdf
 */
export function buildInvoiceFilename(invoice) {
  const rawName = invoice.customer_name || 'Counter_Customer';
  const safeName = rawName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    || 'Customer';

  const invNum = invoice.invoice_number || 'INV';

  const dt = new Date(invoice.created_at || Date.now());
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(dt.getDate()).padStart(2, '0');
  const mmm = months[dt.getMonth()];
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');

  return `${safeName}_${invNum}_${dd}-${mmm}-${yyyy}_${hh}${mi}.pdf`;
}

/**
 * Draw decorative header & footer background elements on any page
 */
function drawPageDecorations(doc, pageWidth, pageHeight) {
  // 1. Warm cream full-page background (#FFF9F1)
  doc.setFillColor(255, 249, 241);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // 2. Top-right organic decor wave ('Health Happier Lives')
  try {
    const trW = 50;
    const trH = 43;
    doc.addImage(invoiceAssets.topRightDecor, 'PNG', pageWidth - trW, 0, trW, trH);
  } catch (e) {
    console.warn('Failed to draw top-right decor:', e);
  }

  // 3. Bottom decor wave ('Thank You!', 'STAY HEALTHY | STAY HAPPY ♡', pill artwork)
  try {
    const botW = pageWidth;
    const botH = 55;
    doc.addImage(invoiceAssets.bottomDecor, 'PNG', 0, pageHeight - botH, botW, botH);
  } catch (e) {
    console.warn('Failed to draw bottom decor:', e);
  }
}

/**
 * Generate a Premium Warm Medical/Pharmacy TAX INVOICE PDF matching the reference design.
 */
export function generateInvoicePDF(invoice, settings = {}, action = 'save') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;                                    // 14mm margins
  const rightX = pageWidth - margin;                   // 196mm
  const contentWidth = pageWidth - (margin * 2);        // 182mm

  // Colors
  const burntOrange = [184, 79, 22];   // #B84F16 Primary Accent
  const darkBrown   = [74, 36, 21];    // #4A2415 Headings
  const textDark    = [37, 37, 37];    // #252525 Body text
  const textMuted   = [102, 97, 93];   // #66615D Subtitles & labels
  const cardBeige   = [247, 237, 224]; // #F7EDE0 Surface cards
  const borderBeige = [237, 224, 210]; // #EDE0D2 Table borders

  // --- DRAW BACKGROUND DECORATIONS FOR PAGE 1 ---
  drawPageDecorations(doc, pageWidth, pageHeight);

  // --- HEADER SECTION ---
  const headerY = 13;

  // 1. Medico Logo mark (cross + leaf)
  try {
    doc.addImage(invoiceAssets.medicoLogo, 'PNG', margin, headerY, 15, 15);
  } catch (e) {
    console.warn('Logo error:', e);
  }

  // 2. Shop Name & Slogan (Left Header)
  const brandName = settings.shop_name || 'Medico';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...textDark);
  doc.text(brandName, margin + 17, headerY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text('YOUR HEALTH  OUR PRIORITY', margin + 17, headerY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textMuted);
  const tagLine = settings.shop_address || 'Pharmacy | Medicines | Better Tomorrow';
  doc.text(tagLine, margin, headerY + 20);

  // 3. Contact Info Block (Right Header)
  const contactX = 112;
  const iconSize = 4.2;

  // Phone
  const phone = settings.shop_phone || '9970886788';
  doc.addImage(invoiceAssets.icons.phone, 'PNG', contactX, headerY + 1, iconSize, iconSize);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  doc.text(phone, contactX + 6, headerY + 4);

  // Email
  const email = settings.shop_email || '-';
  doc.addImage(invoiceAssets.icons.email, 'PNG', contactX, headerY + 6.5, iconSize, iconSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  doc.text(email, contactX + 6, headerY + 9.5);

  // GSTIN & DL No
  const gstDl = `GSTIN: ${settings.shop_gst || '-'}  |  DL No: ${settings.shop_dl || '-'}`;
  doc.addImage(invoiceAssets.icons.gst, 'PNG', contactX, headerY + 12, iconSize, iconSize);
  doc.text(gstDl, contactX + 6, headerY + 15);

  // Location / Tagline
  doc.addImage(invoiceAssets.icons.location, 'PNG', contactX, headerY + 17.5, iconSize, iconSize);
  doc.setFont('helvetica', 'bold');
  doc.text(brandName, contactX + 6, headerY + 20.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text('Care Today for a Healthier Tomorrow', contactX + 6, headerY + 23.5);

  // 4. Horizontal Burnt Orange Divider
  const divY = headerY + 26;
  doc.setDrawColor(...burntOrange);
  doc.setLineWidth(0.45);
  doc.line(margin, divY, rightX, divY);

  // --- TAX INVOICE TITLE ---
  const titleY = divY + 9.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(...textDark);
  doc.text('TAX ', margin, titleY);
  const taxWidth = doc.getTextWidth('TAX ');
  doc.setTextColor(...burntOrange);
  doc.text('INVOICE', margin + taxWidth, titleY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text('QUALITY MEDICINES FOR A HEALTHIER YOU', margin, titleY + 4.5);

  // --- BILL TO & INVOICE DETAILS CARDS ---
  const cardY = titleY + 8;
  const cardH = 20;
  const cardGap = 8;
  const cardW = (contentWidth - cardGap) / 2; // ~87mm

  // Card 1: BILL TO
  doc.setFillColor(...cardBeige);
  doc.roundedRect(margin, cardY, cardW, cardH, 2.5, 2.5, 'F');
  doc.addImage(invoiceAssets.icons.customer, 'PNG', margin + 3.5, cardY + 3.5, 13, 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text('BILL TO:', margin + 19, cardY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...textDark);
  const custName = invoice.customer_name || 'Counter Customer';
  doc.text(custName, margin + 19, cardY + 12.5, { maxWidth: cardW - 22 });

  if (invoice.customer_phone || invoice.doctor_name) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...textMuted);
    const subLines = [];
    if (invoice.customer_phone) subLines.push(`Ph: ${invoice.customer_phone}`);
    if (invoice.doctor_name) subLines.push(`Dr: ${invoice.doctor_name}`);
    doc.text(subLines.join('  ·  '), margin + 19, cardY + 16.5, { maxWidth: cardW - 22 });
  }

  // Card 2: INVOICE DETAILS
  const card2X = margin + cardW + cardGap;
  doc.setFillColor(...cardBeige);
  doc.roundedRect(card2X, cardY, cardW, cardH, 2.5, 2.5, 'F');
  doc.addImage(invoiceAssets.icons.invoice, 'PNG', card2X + 3.5, cardY + 3.5, 13, 13);

  const dt = new Date(invoice.created_at || Date.now());
  const dateStr = dt.toLocaleDateString('en-IN');
  const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).toLowerCase();

  const labelsX = card2X + 19;
  const valsX   = card2X + 44;

  const drawCardRow = (lbl, val, rowY) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...textMuted);
    doc.text(lbl, labelsX, rowY);
    doc.text(':', labelsX + 21, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    doc.text(val, valsX, rowY);
  };

  drawCardRow('Invoice No', invoice.invoice_number || '-', cardY + 6.5);
  drawCardRow('Date', dateStr, cardY + 11);
  drawCardRow('Time', timeStr, cardY + 15.5);

  // --- MEDICINE TABLE ---
  const tableStartY = cardY + cardH + 5;

  const tableRows = (invoice.items || []).map((item, i) => [
    i + 1,
    item.brand_name || item.name || '-',
    item.hsn_code || '-',
    item.batch_number || '-',
    item.mfg_date ? new Date(item.mfg_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-',
    item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-',
    item.quantity || 0,
    (item.unit_price || 0).toFixed(2),
    `${item.gst_percent || 0}%`,
    item.discount_percent > 0 ? `${item.discount_percent}%` : '-',
    (item.total || (item.quantity * item.unit_price) || 0).toFixed(2),
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['S.N.', 'Medicine Description', 'HSN', 'Batch', 'Mfg.', 'Exp.', 'Qty', 'Rate (Rs)', 'GST', 'Disc.', 'Amount (Rs)']],
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: burntOrange,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      cellPadding: 2.2,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: textDark,
      fontSize: 7.5,
      cellPadding: 2.2,
      lineColor: borderBeige,
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 8 },   // S.N.
      1:  { halign: 'left',   cellWidth: 47 },  // Description
      2:  { halign: 'center', cellWidth: 14 },  // HSN
      3:  { halign: 'center', cellWidth: 17 },  // Batch
      4:  { halign: 'center', cellWidth: 13 },  // Mfg.
      5:  { halign: 'center', cellWidth: 13 },  // Exp.
      6:  { halign: 'center', cellWidth: 9 },   // Qty
      7:  { halign: 'right',  cellWidth: 16 },  // Rate
      8:  { halign: 'center', cellWidth: 11 },  // GST
      9:  { halign: 'center', cellWidth: 11 },  // Disc.
      10: { halign: 'right',  cellWidth: 23 },  // Amount
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // If table overflows to page 2+, redraw header & footer decor
      if (data.pageNumber > 1) {
        drawPageDecorations(doc, pageWidth, pageHeight);
      }
    },
  });

  // Position after table
  let afterTableY = doc.lastAutoTable.finalY + 5;

  // Multi-page check: if totals won't fit on this page, add a new page
  if (afterTableY > pageHeight - 85) {
    doc.addPage();
    drawPageDecorations(doc, pageWidth, pageHeight);
    afterTableY = margin + 10;
  }

  // --- SUMMARY SECTION (AMOUNT IN WORDS + TOTALS) ---
  const sumCardW = 96;
  const sumCardH = 20;

  // Left: Amount in Words Card
  doc.setFillColor(...cardBeige);
  doc.roundedRect(margin, afterTableY, sumCardW, sumCardH, 2.5, 2.5, 'F');
  doc.addImage(invoiceAssets.icons.rupee, 'PNG', margin + 3.5, afterTableY + 3.5, 13, 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkBrown);
  doc.text('Amount in Words:', margin + 19, afterTableY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  const wordsText = numberToWords(invoice.total_amount || 0);
  doc.text(wordsText, margin + 19, afterTableY + 12, { maxWidth: sumCardW - 22 });

  // Right: Totals Breakdown Table
  const totalsW = 78;
  const totalsX = rightX - totalsW;
  const subtotal = invoice.subtotal || 0;
  const discAmt  = invoice.discount_amount || 0;
  const discPct  = invoice.discount_percent || 0;
  const gstAmt   = invoice.gst_amount || 0;
  const totalAmt = invoice.total_amount || 0;

  let totY = afterTableY + 2;

  const drawTotalLine = (label, val, isOrange = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textDark);
    doc.text(label, totalsX, totY);

    if (isOrange) {
      doc.setTextColor(...burntOrange);
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setTextColor(...textDark);
    }
    doc.text(`Rs. ${val}`, rightX, totY, { align: 'right' });
    totY += 4.5;
  };

  drawTotalLine('Subtotal', subtotal.toFixed(2));

  if (discAmt > 0 || discPct > 0) {
    const discLabel = discPct > 0 ? `Discount (${discPct}%)` : 'Discount';
    drawTotalLine(discLabel, `-${discAmt.toFixed(2)}`, true);
  }

  if (gstAmt > 0) {
    if (invoice.is_interstate) {
      drawTotalLine('IGST', gstAmt.toFixed(2));
    } else {
      const halfGst = (gstAmt / 2).toFixed(2);
      const halfPct = discPct > 0 ? '' : ' (2.5%)';
      drawTotalLine(`CGST${halfPct}`, halfGst);
      drawTotalLine(`SGST${halfPct}`, halfGst);
    }
  }

  // Net Payable Banner
  totY += 1.5;
  doc.setFillColor(...burntOrange);
  doc.roundedRect(totalsX, totY, totalsW, 9.5, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Net Payable', totalsX + 4, totY + 6.5);
  doc.setFontSize(12);
  doc.text(`Rs. ${totalAmt.toFixed(2)}`, rightX - 4, totY + 6.5, { align: 'right' });

  // --- TERMS & CONDITIONS & SIGNATURE SECTION ---
  const termsY = Math.max(afterTableY + sumCardH + 5, totY + 15);

  // Left: Terms & Conditions
  doc.addImage(invoiceAssets.icons.terms, 'PNG', margin, termsY - 1, 5.5, 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkBrown);
  doc.text('Terms & Conditions:', margin + 7.5, termsY + 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  const termsList = [
    '1. Goods once sold will not be taken back or exchanged.',
    '2. Subject to local jurisdiction.',
    '3. Medicines should be taken under medical supervision.',
    '4. Our responsibility ceases as soon as goods leave our premises.'
  ];
  termsList.forEach((term, idx) => {
    doc.text(term, margin, termsY + 8 + (idx * 3.5));
  });

  // Right: Authorised Signatory
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);
  doc.text(`For ${brandName}`, rightX, termsY + 3.5, { align: 'right' });

  doc.setDrawColor(...textMuted);
  doc.setLineWidth(0.3);
  doc.line(rightX - 52, termsY + 19, rightX, termsY + 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textMuted);
  doc.text('Authorised Signatory', rightX - 26, termsY + 23, { align: 'center' });

  // --- ACTION HANDLING ---
  if (action === 'print') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === 'download') {
    downloadPDF(doc, buildInvoiceFilename(invoice));
  }

  return doc;
}

export async function sendInvoiceViaWhatsApp(invoice, settings) {
  if (!invoice.customer_phone) {
    throw new Error('Customer phone number is missing');
  }

  const doc = generateInvoicePDF(invoice, settings, 'none');
  const pdfBase64 = doc.output('datauristring');

  const message = `Hello, here is your invoice ${invoice.invoice_number} from ${settings.shop_name || 'AthassMediSync'} for ₹${invoice.total_amount}. Thank you for your business!`;

  return await api.sendWhatsAppPdf({
    phone: invoice.customer_phone,
    pdfBase64,
    filename: buildInvoiceFilename(invoice),
    message
  });
}

export function downloadPDF(doc, filename) {
  const base64 = doc.output('datauristring').split(',')[1];

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${BASE_URL}/api/download-pdf`;
  form.style.display = 'none';

  const filenameInput = document.createElement('input');
  filenameInput.name = 'filename';
  filenameInput.value = filename;
  form.appendChild(filenameInput);

  const dataInput = document.createElement('input');
  dataInput.name = 'base64';
  dataInput.value = base64;
  form.appendChild(dataInput);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}
