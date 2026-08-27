// ============================================================================
// Money math — GST-INCLUSIVE model. MUST stay identical to `server/money.js`
// (that file is CommonJS, this is an ESM bundle, so they are intentionally
// mirrored rather than shared-imported). If you change the math here, change it
// there too, or on-screen totals and saved totals will disagree.
// ============================================================================

// Round to 2 decimals (currency). Guards against NaN/undefined.
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Inclusive amount the customer pays for one line (unitPrice is tax-inclusive).
export const calculateLineTotal = (quantity, unitPrice, discountPercent) => {
  return (Number(quantity) || 0) * (Number(unitPrice) || 0) * (1 - (Number(discountPercent) || 0) / 100);
};

// Split an inclusive amount into { taxable, gst }. Mirrors server splitInclusive.
export const splitInclusive = (grossAmount, gstPercent) => {
  const g = Number(grossAmount) || 0;
  const pct = Number(gstPercent) || 0;
  if (pct <= 0) return { taxable: round2(g), gst: 0 };
  const taxable = g / (1 + pct / 100);
  return { taxable: round2(taxable), gst: round2(g - taxable) };
};

// GST CONTAINED in an already-inclusive amount (NOT added on top).
export const calculateGstFromTotal = (total, gstPercent) => {
  return splitInclusive(total, gstPercent).gst;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount).replace('INR', '₹');
};

export const numberToWords = (amount) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function convert_millions(num) {
    if (num >= 100000) {
      return convert_millions(Math.floor(num / 100000)) + " Lakh " + convert_thousands(num % 100000);
    } else {
      return convert_thousands(num);
    }
  }

  function convert_thousands(num) {
    if (num >= 1000) {
      return convert_hundreds(Math.floor(num / 1000)) + " Thousand " + convert_hundreds(num % 1000);
    } else {
      return convert_hundreds(num);
    }
  }

  function convert_hundreds(num) {
    if (num > 99) {
      return ones[Math.floor(num / 100)] + " Hundred " + convert_tens(num % 100);
    } else {
      return convert_tens(num);
    }
  }

  function convert_tens(num) {
    if (num < 10) return ones[num];
    else if (num >= 10 && num < 20) return teens[num - 10];
    else {
      return tens[Math.floor(num / 10)] + " " + ones[num % 10];
    }
  }

  if (amount === 0) return "Zero";
  
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  
  let result = convert_millions(whole) + " Rupees";
  if (fraction > 0) {
    result += " and " + convert_tens(fraction) + " Paise";
  }
  
  return result + " Only";
};

export const getWhatsAppUrl = (phone, invoiceNumber, totalAmount, shopName) => {
  if (!phone) return null;
  const cleanPhone = phone.replace(/\D/g, '');
  const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const message = `Hello, here is your invoice ${invoiceNumber} from ${shopName} for ₹${totalAmount}. Thank you for your business!`;
  return `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
};
