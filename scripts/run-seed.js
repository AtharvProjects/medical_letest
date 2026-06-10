// Electron seeder - writes output to a log file
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'data', 'seed-result.txt');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

app.whenReady().then(() => {
  // Clear log
  fs.writeFileSync(LOG_FILE, '');
  
  try {
    // Init DB schema
    const db = require('../server/db.js');
    log('✅ DB schema initialized');

    // Check if already seeded
    const existingMeds = db.prepare('SELECT COUNT(*) as c FROM medicines').get();
    if (existingMeds.c > 5) {
      log('⚠️  Database already seeded with ' + existingMeds.c + ' medicines. Delete pharmacy.db to re-seed.');
      app.quit();
      return;
    }

    // Run the seeder functions inline
    // ─── Helpers ───────────────────────────────────────
    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
    function rndFloat(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(2)); }
    function dateStr(date) { return date.toISOString().replace('T', ' ').slice(0, 19); }
    function expiryStr(monthsFromNow) {
      const d = new Date(); d.setMonth(d.getMonth() + monthsFromNow);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    function mfgStr(monthsAgo) {
      const d = new Date(); d.setMonth(d.getMonth() - monthsAgo);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    // ─── Settings ──────────────────────────────────────
    const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    upsertSetting.run('shop_name', 'Shree Samarth Medical');
    upsertSetting.run('shop_address', 'Shop No. 3, Appa Balwant Chowk, Kasba Peth, Pune – 411011');
    upsertSetting.run('shop_phone', '9823456701');
    upsertSetting.run('shop_gst', '27ABCPS1234Z1Z5');
    upsertSetting.run('shop_dl', 'MH-PNE-20B-0234 / MH-PNE-21B-0234');
    upsertSetting.run('low_stock_threshold', '10');
    upsertSetting.run('expiry_alert_days', '90');
    log('✅ Settings configured');

    // ─── Suppliers ─────────────────────────────────────
    const SUPPLIERS = [
      { name: 'Shree Pharma Distributors', phone: '9876543210', email: 'shree@pharma.com', address: 'Shop 12, Kasba Peth, Pune', gst_number: '27AABCS1234D1Z5', dl_number: 'MH-PNE-DL-0041' },
      { name: 'Maharashtra Medical Agency', phone: '9823456789', email: 'mma@medagency.in', address: '45 Budhwar Peth, Pune', gst_number: '27BBBCS4321E2Z6', dl_number: 'MH-PNE-DL-0099' },
      { name: 'Pune Wholesale Drugs', phone: '9112233445', email: 'pwd@wholesale.in', address: 'Bhavani Peth Market, Pune', gst_number: '27CCCMS9876F3Z7', dl_number: 'MH-PNE-DL-0155' },
      { name: 'Hindustan Pharma Supply', phone: '9988776655', email: 'hps@hindpharma.com', address: 'Sadashiv Peth, Pune', gst_number: '27DDDPS6543G4Z8', dl_number: 'MH-PNE-DL-0211' },
      { name: 'Deccan Drug House', phone: '9765432109', email: 'ddh@deccan.co.in', address: 'Deccan Gymkhana, Pune', gst_number: '27EEEDS3210H5Z9', dl_number: 'MH-PNE-DL-0288' },
    ];
    const DOCTORS = [
      { name: 'Dr. Rajesh Kulkarni', hospital: 'Sahyadri Hospital', phone: '9823001122', address: 'Deccan, Pune', specialization: 'General Physician' },
      { name: 'Dr. Priya Deshmukh', hospital: 'Ruby Hall Clinic', phone: '9765112233', address: 'Sassoon Road, Pune', specialization: 'Gynecologist' },
      { name: 'Dr. Suresh Patil', hospital: 'Deenanath Mangeshkar Hospital', phone: '9988223344', address: 'Erandwane, Pune', specialization: 'Cardiologist' },
      { name: 'Dr. Anjali Joshi', hospital: 'Jehangir Hospital', phone: '9876334455', address: 'Sassoon Road, Pune', specialization: 'Diabetologist' },
      { name: 'Dr. Vikram Bhosale', hospital: 'Poona Hospital', phone: '9112445566', address: 'Sadashiv Peth, Pune', specialization: 'Orthopedic' },
      { name: 'Dr. Meena Shinde', hospital: 'KEM Hospital', phone: '9823556677', address: 'Rasta Peth, Pune', specialization: 'Pediatrician' },
      { name: 'Dr. Arun Iyer', hospital: 'Inlaks Hospital', phone: '9765667788', address: 'Hadapsar, Pune', specialization: 'Neurologist' },
      { name: 'Dr. Sunita Wagh', hospital: 'Bharati Hospital', phone: '9988778899', address: 'Dhankawadi, Pune', specialization: 'Dermatologist' },
    ];
    const CUSTOMERS = [
      { name: 'Ramesh Sharma', phone: '9823100001', address: 'Kasba Peth, Pune' },
      { name: 'Sunita Patil', phone: '9765200002', address: 'Sadashiv Peth, Pune' },
      { name: 'Mohan Kulkarni', phone: '9876300003', address: 'Shivajinagar, Pune' },
      { name: 'Kavita Deshmukh', phone: '9988400004', address: 'Kothrud, Pune' },
      { name: 'Anil Joshi', phone: '9112500005', address: 'Deccan, Pune' },
      { name: 'Priya Bhosale', phone: '9823600006', address: 'Pimpri, Pune' },
      { name: 'Santosh Mane', phone: '9765700007', address: 'Chinchwad, Pune' },
      { name: 'Rekha More', phone: '9876800008', address: 'Hadapsar, Pune' },
      { name: 'Vijay Kale', phone: '9988900009', address: 'Kondhwa, Pune' },
      { name: 'Lata Pawar', phone: '9112010010', address: 'Bibwewadi, Pune' },
      { name: 'Suresh Nair', phone: '9823020011', address: 'Swargate, Pune' },
      { name: 'Anjali Deshpande', phone: '9765030012', address: 'Tilak Road, Pune' },
      { name: 'Prakash Gaikwad', phone: '9876040013', address: 'Dhankawadi, Pune' },
      { name: 'Meena Thosar', phone: '9988050014', address: 'Wanowrie, Pune' },
      { name: 'Deepak Rane', phone: '9112060015', address: 'Katraj, Pune' },
      { name: 'Neha Shinde', phone: '9823070016', address: 'Warje, Pune' },
      { name: 'Ganesh Chavan', phone: '9765080017', address: 'Bavdhan, Pune' },
      { name: 'Usha Sathe', phone: '9876090018', address: 'Baner, Pune' },
      { name: 'Manoj Gupta', phone: '9988100019', address: 'Aundh, Pune' },
      { name: 'Shalini Mehta', phone: '9112110020', address: 'Pashan, Pune' },
      { name: 'Raju Jadhav', phone: '9823120021', address: 'Wakad, Pune' },
      { name: 'Pooja Kadam', phone: '9765130022', address: 'Hinjewadi, Pune' },
      { name: 'Mahesh Salave', phone: '9876140023', address: 'Pimple Saudagar, Pune' },
      { name: 'Geeta Gosavi', phone: '9988150024', address: 'Sangvi, Pune' },
      { name: 'Ashok Thorat', phone: '9112160025', address: 'Vishrantwadi, Pune' },
    ];
    const MEDICINES = [
      { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanate', company_name: 'GlaxoSmithKline', drug_group: 'Antibiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Azithral 500', generic_name: 'Azithromycin', company_name: 'Alembic', drug_group: 'Antibiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 3, is_h1: 0 },
      { brand_name: 'Ciprolet 500', generic_name: 'Ciprofloxacin', company_name: 'Dr. Reddy\'s', drug_group: 'Antibiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Oflomac 200', generic_name: 'Ofloxacin', company_name: 'Macleods', drug_group: 'Antibiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Mox 500', generic_name: 'Amoxicillin', company_name: 'Ranbaxy', drug_group: 'Antibiotic', unit_category: 'Capsule', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Crocin 500', generic_name: 'Paracetamol', company_name: 'GSK', drug_group: 'Analgesic', unit_category: 'Tablet', hsn_code: '30049011', gst_percent: 12, schedule: '', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Combiflam', generic_name: 'Ibuprofen + Paracetamol', company_name: 'Sanofi', drug_group: 'Analgesic', unit_category: 'Tablet', hsn_code: '30049011', gst_percent: 12, schedule: '', tablets_per_strip: 20, is_h1: 0 },
      { brand_name: 'Voveran 50', generic_name: 'Diclofenac', company_name: 'Novartis', drug_group: 'NSAID', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Zerodol P', generic_name: 'Aceclofenac + Paracetamol', company_name: 'IPCA', drug_group: 'NSAID', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Ultracet', generic_name: 'Tramadol + Paracetamol', company_name: 'Janssen', drug_group: 'Opioid Analgesic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H1', tablets_per_strip: 10, is_h1: 1 },
      { brand_name: 'Pantocid DSR', generic_name: 'Pantoprazole + Domperidone', company_name: 'Sun Pharma', drug_group: 'Antacid', unit_category: 'Capsule', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Razo 20', generic_name: 'Rabeprazole', company_name: 'Dr. Reddy\'s', drug_group: 'PPI', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Digene Gel', generic_name: 'Antacid Mixture', company_name: 'Abbott', drug_group: 'Antacid', unit_category: 'Syrup', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Norflox TZ', generic_name: 'Norfloxacin + Tinidazole', company_name: 'Cipla', drug_group: 'Antibiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Sporlac DS', generic_name: 'Lactobacillus', company_name: 'Sanmar', drug_group: 'Probiotic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Aten 50', generic_name: 'Atenolol', company_name: 'IPCA', drug_group: 'Beta Blocker', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 14, is_h1: 0 },
      { brand_name: 'Telmikind 40', generic_name: 'Telmisartan', company_name: 'Mankind', drug_group: 'ARB', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Stamlo 5', generic_name: 'Amlodipine', company_name: 'Dr. Reddy\'s', drug_group: 'CCB', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Cardace 2.5', generic_name: 'Ramipril', company_name: 'Sanofi', drug_group: 'ACE Inhibitor', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 14, is_h1: 0 },
      { brand_name: 'Ecosprin 75', generic_name: 'Aspirin', company_name: 'USV', drug_group: 'Antiplatelet', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 14, is_h1: 0 },
      { brand_name: 'Glycomet 500', generic_name: 'Metformin', company_name: 'USV', drug_group: 'Antidiabetic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 20, is_h1: 0 },
      { brand_name: 'Glucobay 50', generic_name: 'Acarbose', company_name: 'Bayer', drug_group: 'Antidiabetic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Januvia 50', generic_name: 'Sitagliptin', company_name: 'MSD', drug_group: 'DPP-4 Inhibitor', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 14, is_h1: 0 },
      { brand_name: 'Amaryl 2', generic_name: 'Glimepiride', company_name: 'Sanofi', drug_group: 'Sulfonylurea', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Asthalin Inhaler', generic_name: 'Salbutamol', company_name: 'Cipla', drug_group: 'Bronchodilator', unit_category: 'Inhaler', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Levolin 1mg', generic_name: 'Levosalbutamol', company_name: 'Cipla', drug_group: 'Bronchodilator', unit_category: 'Syrup', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Montek LC', generic_name: 'Montelukast + Levocetirizine', company_name: 'Sun Pharma', drug_group: 'Antiallergic', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Dexona 0.5', generic_name: 'Dexamethasone', company_name: 'Samarth', drug_group: 'Corticosteroid', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 30, is_h1: 0 },
      { brand_name: 'Benadryl Cough', generic_name: 'Diphenhydramine + Ammonium Chloride', company_name: 'Johnson & Johnson', drug_group: 'Cough Suppressant', unit_category: 'Syrup', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Shelcal 500', generic_name: 'Calcium + Vitamin D3', company_name: 'Torrent', drug_group: 'Supplement', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Zincovit', generic_name: 'Multivitamin + Zinc', company_name: 'Apex', drug_group: 'Supplement', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Becosules', generic_name: 'Vitamin B Complex + C', company_name: 'Pfizer', drug_group: 'Supplement', unit_category: 'Capsule', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 20, is_h1: 0 },
      { brand_name: 'Neurobion Forte', generic_name: 'Vitamin B1+B6+B12', company_name: 'Merck', drug_group: 'Supplement', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 30, is_h1: 0 },
      { brand_name: 'Revital H', generic_name: 'Multivitamin + Ginseng', company_name: 'Ranbaxy', drug_group: 'Supplement', unit_category: 'Capsule', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 30, is_h1: 0 },
      { brand_name: 'Thyronorm 50', generic_name: 'Levothyroxine', company_name: 'Abbott', drug_group: 'Thyroid Hormone', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 120, is_h1: 0 },
      { brand_name: 'Eltroxin 100', generic_name: 'Levothyroxine', company_name: 'GlaxoSmithKline', drug_group: 'Thyroid Hormone', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 28, is_h1: 0 },
      { brand_name: 'Lonazep 0.5', generic_name: 'Clonazepam', company_name: 'Sun Pharma', drug_group: 'Benzodiazepine', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Nexito 10', generic_name: 'Escitalopram', company_name: 'Sun Pharma', drug_group: 'SSRI', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 10, is_h1: 0 },
      { brand_name: 'Betnovate-N', generic_name: 'Betamethasone + Neomycin', company_name: 'GlaxoSmithKline', drug_group: 'Topical Steroid', unit_category: 'Cream', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Soframycin Cream', generic_name: 'Framycetin', company_name: 'Sanofi', drug_group: 'Topical Antibiotic', unit_category: 'Cream', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Ciplox Eye Drops', generic_name: 'Ciprofloxacin', company_name: 'Cipla', drug_group: 'Eye Antibiotic', unit_category: 'Drops', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Otrivin', generic_name: 'Xylometazoline', company_name: 'Novartis', drug_group: 'Nasal Decongestant', unit_category: 'Drops', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Fluconac 150', generic_name: 'Fluconazole', company_name: 'Cipla', drug_group: 'Antifungal', unit_category: 'Capsule', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Canesten Cream', generic_name: 'Clotrimazole', company_name: 'Bayer', drug_group: 'Antifungal', unit_category: 'Cream', hsn_code: '30049099', gst_percent: 12, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Atorlip 10', generic_name: 'Atorvastatin', company_name: 'Cipla', drug_group: 'Statin', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Rosuvas 10', generic_name: 'Rosuvastatin', company_name: 'Sun Pharma', drug_group: 'Statin', unit_category: 'Tablet', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 15, is_h1: 0 },
      { brand_name: 'Monocef 1gm Inj', generic_name: 'Ceftriaxone Injection', company_name: 'Aristo', drug_group: 'Antibiotic', unit_category: 'Injection', hsn_code: '30049099', gst_percent: 12, schedule: 'H', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Band-Aid', generic_name: 'Bandage Strip', company_name: '3M', drug_group: 'Surgical', unit_category: 'Strip', hsn_code: '30059010', gst_percent: 5, schedule: '', tablets_per_strip: 1, is_h1: 0 },
      { brand_name: 'Dettol Antiseptic', generic_name: 'Chloroxylenol', company_name: 'Reckitt', drug_group: 'Antiseptic', unit_category: 'Liquid', hsn_code: '38089990', gst_percent: 18, schedule: '', tablets_per_strip: 1, is_h1: 0 },
    ];
    const MRP_MAP = {
      'Augmentin 625': { pr: 145, sr: 165, mrp: 175 }, 'Azithral 500': { pr: 55, sr: 65, mrp: 70 },
      'Ciprolet 500': { pr: 35, sr: 42, mrp: 48 }, 'Oflomac 200': { pr: 28, sr: 34, mrp: 40 },
      'Mox 500': { pr: 30, sr: 36, mrp: 42 }, 'Crocin 500': { pr: 20, sr: 26, mrp: 30 },
      'Combiflam': { pr: 22, sr: 28, mrp: 32 }, 'Voveran 50': { pr: 32, sr: 40, mrp: 46 },
      'Zerodol P': { pr: 40, sr: 50, mrp: 58 }, 'Ultracet': { pr: 65, sr: 80, mrp: 90 },
      'Pantocid DSR': { pr: 55, sr: 68, mrp: 78 }, 'Razo 20': { pr: 48, sr: 58, mrp: 65 },
      'Digene Gel': { pr: 55, sr: 68, mrp: 80 }, 'Norflox TZ': { pr: 38, sr: 46, mrp: 54 },
      'Sporlac DS': { pr: 45, sr: 56, mrp: 65 }, 'Aten 50': { pr: 25, sr: 32, mrp: 38 },
      'Telmikind 40': { pr: 45, sr: 55, mrp: 65 }, 'Stamlo 5': { pr: 28, sr: 35, mrp: 42 },
      'Cardace 2.5': { pr: 48, sr: 58, mrp: 68 }, 'Ecosprin 75': { pr: 18, sr: 24, mrp: 28 },
      'Glycomet 500': { pr: 22, sr: 28, mrp: 35 }, 'Glucobay 50': { pr: 85, sr: 100, mrp: 115 },
      'Januvia 50': { pr: 220, sr: 260, mrp: 295 }, 'Amaryl 2': { pr: 35, sr: 44, mrp: 52 },
      'Asthalin Inhaler': { pr: 85, sr: 100, mrp: 115 }, 'Levolin 1mg': { pr: 48, sr: 58, mrp: 68 },
      'Montek LC': { pr: 55, sr: 68, mrp: 78 }, 'Dexona 0.5': { pr: 12, sr: 16, mrp: 20 },
      'Benadryl Cough': { pr: 72, sr: 88, mrp: 100 }, 'Shelcal 500': { pr: 62, sr: 78, mrp: 90 },
      'Zincovit': { pr: 58, sr: 72, mrp: 85 }, 'Becosules': { pr: 38, sr: 48, mrp: 55 },
      'Neurobion Forte': { pr: 32, sr: 40, mrp: 48 }, 'Revital H': { pr: 145, sr: 175, mrp: 200 },
      'Thyronorm 50': { pr: 52, sr: 62, mrp: 72 }, 'Eltroxin 100': { pr: 58, sr: 70, mrp: 82 },
      'Lonazep 0.5': { pr: 28, sr: 36, mrp: 42 }, 'Nexito 10': { pr: 48, sr: 60, mrp: 70 },
      'Betnovate-N': { pr: 38, sr: 48, mrp: 58 }, 'Soframycin Cream': { pr: 42, sr: 52, mrp: 62 },
      'Ciplox Eye Drops': { pr: 28, sr: 36, mrp: 42 }, 'Otrivin': { pr: 62, sr: 75, mrp: 90 },
      'Fluconac 150': { pr: 45, sr: 55, mrp: 65 }, 'Canesten Cream': { pr: 55, sr: 68, mrp: 80 },
      'Atorlip 10': { pr: 48, sr: 60, mrp: 72 }, 'Rosuvas 10': { pr: 55, sr: 68, mrp: 80 },
      'Monocef 1gm Inj': { pr: 62, sr: 78, mrp: 95 }, 'Band-Aid': { pr: 25, sr: 32, mrp: 38 },
      'Dettol Antiseptic': { pr: 88, sr: 105, mrp: 125 },
    };

    // ─── Insert Suppliers ──────────────────────────────
    const insertSupplier = db.prepare(`INSERT INTO suppliers (name, phone, email, address, gst_number, dl_number) VALUES (?, ?, ?, ?, ?, ?)`);
    const supplierIds = [];
    for (const s of SUPPLIERS) {
      const r = insertSupplier.run(s.name, s.phone, s.email, s.address, s.gst_number, s.dl_number);
      supplierIds.push(r.lastInsertRowid);
    }
    log(`✅ ${SUPPLIERS.length} suppliers inserted`);

    // ─── Insert Doctors ────────────────────────────────
    const insertDoctor = db.prepare(`INSERT INTO doctors (name, hospital, phone, address, specialization) VALUES (?, ?, ?, ?, ?)`);
    const doctorIds = [];
    for (const d of DOCTORS) {
      const r = insertDoctor.run(d.name, d.hospital, d.phone, d.address, d.specialization);
      doctorIds.push(r.lastInsertRowid);
    }
    log(`✅ ${DOCTORS.length} doctors inserted`);

    // ─── Insert Customers ──────────────────────────────
    const insertCustomer = db.prepare(`INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)`);
    const customerIds = [];
    for (const c of CUSTOMERS) {
      const r = insertCustomer.run(c.name, c.phone, c.address);
      customerIds.push(r.lastInsertRowid);
    }
    log(`✅ ${CUSTOMERS.length} customers inserted`);

    // ─── Insert Medicines ──────────────────────────────
    const insertMedicine = db.prepare(`
      INSERT INTO medicines (brand_name, generic_name, company_name, drug_group, unit_category, hsn_code, gst_percent, schedule, is_h1, tablets_per_strip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const medicineIds = {};
    for (const m of MEDICINES) {
      const r = insertMedicine.run(m.brand_name, m.generic_name, m.company_name, m.drug_group, m.unit_category, m.hsn_code, m.gst_percent, m.schedule || '', m.is_h1 || 0, m.tablets_per_strip);
      medicineIds[m.brand_name] = r.lastInsertRowid;
    }
    log(`✅ ${MEDICINES.length} medicines inserted`);

    // ─── Insert Batches ────────────────────────────────
    const insertBatch = db.prepare(`
      INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_rate, selling_rate, mrp, quantity, supplier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const batchIds = {};
    let batchCounter = 1000;

    for (const m of MEDICINES) {
      const medId = medicineIds[m.brand_name];
      const prices = MRP_MAP[m.brand_name] || { pr: 30, sr: 38, mrp: 45 };
      batchIds[medId] = [];

      const batches = [
        { num: `B${batchCounter++}`, mfg: mfgStr(18), exp: expiryStr(rnd(-2, 3)), pr: prices.pr, sr: prices.sr, mrp: prices.mrp, qty: rnd(10, 40), sid: pick(supplierIds) },
        { num: `B${batchCounter++}`, mfg: mfgStr(6), exp: expiryStr(rnd(8, 24)), pr: parseFloat((prices.pr * 1.05).toFixed(2)), sr: parseFloat((prices.sr * 1.05).toFixed(2)), mrp: parseFloat((prices.mrp * 1.05).toFixed(2)), qty: rnd(50, 200), sid: pick(supplierIds) },
      ];

      for (const b of batches) {
        const r = insertBatch.run(medId, b.num, b.mfg, b.exp, b.pr, b.sr, b.mrp, b.qty, b.sid);
        batchIds[medId].push({ id: r.lastInsertRowid, ...b });
      }
    }
    log(`✅ ${Object.keys(batchIds).length * 2} batches inserted`);

    // ─── Insert Purchases (12 months) ─────────────────
    const insertPurchase = db.prepare(`INSERT INTO purchases (supplier_id, invoice_number, total_amount, amount_paid, notes, purchase_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertPurchaseItem = db.prepare(`INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, quantity, purchase_rate, selling_rate, mrp) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertSupplierPayment = db.prepare(`INSERT INTO supplier_payments (supplier_id, amount, payment_mode, payment_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

    let purchaseCount = 0;
    for (let month = 11; month >= 0; month--) {
      for (let pw = 0; pw < 2; pw++) {
        const dayOffset = month * 30 + pw * 15 + rnd(0, 5);
        const purchaseDate = new Date(); purchaseDate.setDate(purchaseDate.getDate() - dayOffset);
        const purchaseDateStr = dateStr(purchaseDate);
        const supplierId = pick(supplierIds);
        const invNum = `PI-${purchaseDate.getFullYear()}-${String(purchaseCount + 1).padStart(4, '0')}`;
        const shuffled = [...MEDICINES].sort(() => Math.random() - 0.5).slice(0, rnd(5, 10));
        let total = 0;
        const purchaseId = insertPurchase.run(supplierId, invNum, 0, 0, 'Monthly stock purchase', purchaseDateStr, purchaseDateStr).lastInsertRowid;
        for (const med of shuffled) {
          const medId = medicineIds[med.brand_name];
          const prices = MRP_MAP[med.brand_name] || { pr: 30, sr: 38, mrp: 45 };
          const batch = pick(batchIds[medId]);
          const qty = rnd(20, 100);
          total += qty * prices.pr;
          insertPurchaseItem.run(purchaseId, medId, batch.id, qty, prices.pr, prices.sr, prices.mrp);
        }
        const amtPaid = parseFloat((total * pick([0.5, 0.75, 1.0])).toFixed(2));
        db.prepare('UPDATE purchases SET total_amount = ?, amount_paid = ? WHERE id = ?').run(parseFloat(total.toFixed(2)), amtPaid, purchaseId);
        if (Math.random() > 0.3) {
          const payDate = new Date(purchaseDate); payDate.setDate(payDate.getDate() + rnd(3, 15));
          insertSupplierPayment.run(supplierId, parseFloat((total * rndFloat(0.5, 1.0)).toFixed(2)), pick(['Cash', 'NEFT', 'UPI', 'Cheque']), dateStr(payDate), `Payment for ${invNum}`, dateStr(payDate));
        }
        purchaseCount++;
      }
    }
    log(`✅ ${purchaseCount} purchases inserted`);

    // ─── Insert Invoices (365 days) ────────────────────
    const insertInvoice = db.prepare(`INSERT INTO invoices (invoice_number, customer_id, doctor_id, subtotal, discount_amount, gst_amount, total_amount, payment_mode, amount_paid, credit_amount, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertInvoiceItem = db.prepare(`INSERT INTO invoice_items (invoice_id, medicine_id, batch_id, quantity, unit_price, mrp, discount_percent, gst_percent, gst_amount, total, tablets_per_strip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertH1Details = db.prepare(`INSERT INTO invoice_h1_details (invoice_id, patient_name, patient_address, doctor_name, doctor_address, doctor_reg_no, prescription_no) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const paymentModes = ['Cash', 'Cash', 'Cash', 'UPI', 'UPI', 'Card', 'Credit'];

    let invoiceCount = 0; let totalRevenue = 0;
    for (let dayOffset = 364; dayOffset >= 0; dayOffset--) {
      const billsThisDay = rnd(3, 8);
      const baseDate = new Date(); baseDate.setDate(baseDate.getDate() - dayOffset);
      for (let b = 0; b < billsThisDay; b++) {
        baseDate.setHours(rnd(9, 20), rnd(0, 59), 0, 0);
        const createdAt = dateStr(baseDate);
        invoiceCount++;
        const invNum = `INV-${baseDate.getFullYear()}-${String(invoiceCount).padStart(5, '0')}`;
        const customerId = Math.random() < 0.6 ? pick(customerIds) : null;
        const doctorId = Math.random() < 0.7 ? pick(doctorIds) : null;
        const payMode = pick(paymentModes);
        const discountPct = pick([0, 0, 0, 5, 10]);
        const numMeds = rnd(1, 4);
        const billMeds = [...MEDICINES].sort(() => Math.random() - 0.5).slice(0, numMeds);
        let subtotal = 0; const lineItems = [];
        for (const med of billMeds) {
          const medId = medicineIds[med.brand_name];
          const prices = MRP_MAP[med.brand_name] || { pr: 30, sr: 38, mrp: 45 };
          const batch = batchIds[medId][1] || batchIds[medId][0];
          const qty = rnd(1, 3);
          const lineSubtotal = qty * prices.sr;
          const discAmt = parseFloat((lineSubtotal * discountPct / 100).toFixed(2));
          const taxable = lineSubtotal - discAmt;
          const gstAmt = parseFloat((taxable * med.gst_percent / 100).toFixed(2));
          const lineTotal = parseFloat((taxable + gstAmt).toFixed(2));
          subtotal += lineSubtotal;
          lineItems.push({ medId, batchId: batch.id, qty, unitPrice: prices.sr, mrp: prices.mrp, lineDisc: discountPct, gstPct: med.gst_percent, gstAmt, lineTotal, tps: med.tablets_per_strip });
        }
        const discountAmount = parseFloat((subtotal * discountPct / 100).toFixed(2));
        const gstTotal = parseFloat(lineItems.reduce((s, i) => s + i.gstAmt, 0).toFixed(2));
        const totalAmount = parseFloat((subtotal - discountAmount + gstTotal).toFixed(2));
        const amountPaid = payMode === 'Credit' ? 0 : totalAmount;
        const creditAmount = payMode === 'Credit' ? totalAmount : 0;
        totalRevenue += totalAmount;
        const invoiceId = insertInvoice.run(invNum, customerId, doctorId, parseFloat(subtotal.toFixed(2)), discountAmount, gstTotal, totalAmount, payMode, amountPaid, creditAmount, '', createdAt).lastInsertRowid;
        for (const li of lineItems) {
          insertInvoiceItem.run(invoiceId, li.medId, li.batchId, li.qty, li.unitPrice, li.mrp, li.lineDisc, li.gstPct, li.gstAmt, li.lineTotal, li.tps);
        }
        if (payMode === 'Credit' && customerId) {
          db.prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?').run(creditAmount, customerId);
        }
        const hasH1 = billMeds.some(m => m.is_h1 === 1);
        if (hasH1 && customerId && doctorId) {
          const cust = CUSTOMERS[customerIds.indexOf(customerId)] || CUSTOMERS[0];
          const doc = DOCTORS[doctorIds.indexOf(doctorId)] || DOCTORS[0];
          try {
            insertH1Details.run(invoiceId, cust.name, cust.address, doc.name, doc.address, `MH-MCI-${rnd(10000, 99999)}`, `RX-${rnd(1000, 9999)}`);
          } catch(e) { /* H1 detail might already exist */ }
        }
      }
    }
    log(`✅ ${invoiceCount} invoices inserted (Revenue: ₹${Math.round(totalRevenue).toLocaleString('en-IN')})`);

    // ─── Set some low-stock items ──────────────────────
    const lowStockMeds = ['Augmentin 625', 'Pantocid DSR', 'Thyronorm 50', 'Januvia 50', 'Montek LC'];
    for (const name of lowStockMeds) {
      const medId = medicineIds[name];
      if (medId && batchIds[medId]) {
        db.prepare('UPDATE batches SET quantity = ? WHERE id = ?').run(rnd(2, 8), batchIds[medId][1].id);
      }
    }
    log('✅ Low-stock demo items set');

    // ─── Summary ───────────────────────────────────────
    log('\n🎉 Seed complete!');
    log(`   Medicines : ${MEDICINES.length}`);
    log(`   Suppliers : ${SUPPLIERS.length}`);
    log(`   Doctors   : ${DOCTORS.length}`);
    log(`   Customers : ${CUSTOMERS.length}`);
    log(`   Purchases : ${purchaseCount}`);
    log(`   Invoices  : ${invoiceCount}`);
    log(`   Revenue   : ₹${Math.round(totalRevenue).toLocaleString('en-IN')}`);

  } catch (err) {
    log('❌ ERROR: ' + err.message);
    log(err.stack);
  }

  app.quit();
});

app.on('window-all-closed', () => app.quit());
