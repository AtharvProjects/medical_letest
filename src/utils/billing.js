export const calculateLineTotal = (quantity, unitPrice, discountPercent) => {
  return quantity * unitPrice * (1 - (discountPercent || 0) / 100);
};

export const calculateGstFromTotal = (total, gstPercent) => {
  if (!gstPercent) return 0;
  return (total * gstPercent) / 100;
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
