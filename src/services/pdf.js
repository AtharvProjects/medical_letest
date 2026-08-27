import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToWords } from '../utils/billing';
import { api, BASE_URL } from './api';

export function generateInvoicePDF(invoice, settings, action = 'save') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Professional Colors
  const primaryColor = [30, 58, 95]; // Dark Blue
  const accentColor = [167, 199, 231]; // Pastel Blue
  const textColor = [50, 50, 50];

  // Helper for right alignment
  const rightX = pageWidth - margin;

  // --- HEADER SECTION ---
  doc.setFillColor(...accentColor);
  doc.rect(margin, margin, pageWidth - (margin * 2), 25, 'F');
  
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(settings.shop_name || 'AthassMediSync', pageWidth / 2, 23, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  const shopDetails = [
    settings.shop_address,
    `Phone: ${settings.shop_phone || '-'} | Email: ${settings.shop_email || '-'}`,
    `GSTIN: ${settings.shop_gst || '-'} | DL No: ${settings.shop_dl || '-'}`
  ].filter(Boolean);
  
  let headerY = 28;
  shopDetails.forEach(line => {
    doc.text(line, pageWidth / 2, headerY, { align: 'center' });
    headerY += 4;
  });

  // --- INVOICE INFO SECTION ---
  let y = 45;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  const title = invoice.gst_amount > 0 ? 'TAX INVOICE' : 'RETAIL BILL';
  doc.text(title, margin, y);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  doc.text(`Invoice No: ${invoice.invoice_number}`, rightX, y, { align: 'right' });
  y += 5;
  doc.text(`Date: ${new Date(invoice.created_at || new Date()).toLocaleDateString('en-IN')}`, rightX, y, { align: 'right' });
  doc.text(`Time: ${new Date(invoice.created_at || new Date()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, rightX, y + 4, { align: 'right' });

  // Customer & Doctor Box
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(`${invoice.customer_name || 'Counter Customer'}`, margin, y);
  y += 4;
  if (invoice.customer_phone) {
    doc.text(`Contact: ${invoice.customer_phone}`, margin, y);
    y += 4;
  }
  if (invoice.doctor_name) {
    doc.setFont('helvetica', 'italic');
    doc.text(`Prescribed by: Dr. ${invoice.doctor_name}`, margin, y);
    y += 4;
  }

  y += 5;

  // --- ITEMS TABLE ---
  const tableRows = (invoice.items || []).map((item, i) => [
    i + 1,
    item.brand_name,
    item.hsn_code || '-',
    item.batch_number || '-',
    item.mfg_date && item.mfg_date !== '' ? new Date(item.mfg_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-',
    item.expiry_date && item.expiry_date !== '' ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-',
    item.quantity || 0,
    (item.unit_price || 0).toFixed(2),
    `${item.gst_percent || 0}%`,
    item.discount_percent > 0 ? `${item.discount_percent}%` : '-',
    (item.total || 0).toFixed(2),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['S.N.', 'Medicine Description', 'HSN', 'Batch', 'Mfg.', 'Exp.', 'Qty', 'Rate', 'GST', 'Disc', 'Amount']],
    body: tableRows,
    theme: 'grid',
    headStyles: { 
      fillColor: primaryColor, 
      textColor: [255, 255, 255], 
      fontSize: 7.5, 
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: { fontSize: 7.5, textColor: textColor },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 42 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 10 },
      7: { halign: 'right', cellWidth: 16 },
      8: { halign: 'center', cellWidth: 10 },
      9: { halign: 'center', cellWidth: 10 },
      10: { halign: 'right', cellWidth: 18 },
    },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 10;

  // --- SUMMARY SECTION ---
  if (y > pageHeight - 60) {
    doc.addPage();
    y = margin + 10;
  }

  // Amount in words
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Amount in Words:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(numberToWords(invoice.total_amount), margin, y + 4, { maxWidth: 100 });

  // Totals Column
  const summaryX = pageWidth - margin - 60;
  doc.setFontSize(9);
  
  const drawRow = (label, value, isBold = false, isFinal = false) => {
    if (isBold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    
    doc.text(label, summaryX, y);
    doc.text(`Rs. ${value}`, rightX, y, { align: 'right' });
    
    if (isFinal) {
      doc.setLineWidth(0.5);
      doc.line(summaryX, y + 1.5, rightX, y + 1.5);
      y += 6;
    } else {
      y += 5;
    }
  };

  drawRow('Subtotal', (invoice.subtotal || 0).toFixed(2));
  if (invoice.discount_amount > 0) {
    drawRow('Discount', `-${(invoice.discount_amount || 0).toFixed(2)}`);
  }
  
  if (invoice.gst_amount > 0) {
    if (invoice.is_interstate) {
      // Inter-state supply: a single IGST line for the full tax.
      drawRow('IGST', (invoice.gst_amount || 0).toFixed(2));
    } else {
      // Intra-state supply: tax splits equally into CGST and SGST.
      const halfGst = (invoice.gst_amount / 2).toFixed(2);
      drawRow('CGST', halfGst);
      drawRow('SGST', halfGst);
    }
  }
  
  y += 2;
  doc.setFillColor(...primaryColor);
  doc.rect(summaryX - 2, y - 4, pageWidth - margin - (summaryX - 2) + 2, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Net Payable', summaryX, y + 1.5);
  doc.text(`Rs. ${(invoice.total_amount || 0).toFixed(2)}`, rightX, y + 1.5, { align: 'right' });
  
  doc.setTextColor(...textColor);
  y += 12;

  // --- FOOTER SECTION ---
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Terms & Conditions:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const terms = [
    '1. Goods once sold will not be taken back or exchanged.',
    '2. Subject to local jurisdiction.',
    '3. Medicines should be taken under medical supervision.',
    '4. Our responsibility ceases as soon as goods leave our premises.'
  ];
  terms.forEach((term, i) => {
    doc.text(term, margin, y + 4 + (i * 3.5));
  });

  // Signature area
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${settings.shop_name || 'AthassMediSync'}`, rightX, y + 4, { align: 'right' });
  doc.setDrawColor(150);
  doc.line(rightX - 50, y + 20, rightX, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Authorised Signatory', rightX - 25, y + 24, { align: 'center' });

  // Thank you message
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text('Get well soon!', pageWidth / 2, pageHeight - 15, { align: 'center' });

  // Final Action
  if (action === 'print') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === 'download') {
    downloadPDF(doc, `Invoice_${invoice.invoice_number}.pdf`);
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
    filename: `Invoice_${invoice.invoice_number}.pdf`,
    message
  });
}

export function openWhatsAppWebInvoice(invoice, settings) {
  if (!invoice.customer_phone) return;
  const digits = String(invoice.customer_phone).replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(
    `Hello! Here is your invoice details from ${settings.shop_name || 'AthassMediSync'}:\nInvoice No: ${invoice.invoice_number}\nAmount: ₹${invoice.total_amount}\nThank you for choosing us!`
  );
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
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
