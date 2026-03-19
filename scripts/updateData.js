/**
 * updateData.js
 * Downloads latest CZ + SK orders and cost data from Google Sheets,
 * parses them, and writes updated realDataCZ.ts + realDataSK.ts.
 *
 * Run manually:   node scripts/updateData.js
 * Scheduled:      Windows Task Scheduler @ 05:00 daily
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Google Sheets export URLs ─────────────────────────────────────────────────
const SHEETS = {
  orders_cz: 'https://docs.google.com/spreadsheets/d/1vUJ68JjiMV9l84uKKg2rxq87sEHBXmpIls-MC3AimOs/export?format=csv&gid=2005387418',
  orders_sk: 'https://docs.google.com/spreadsheets/d/1vUJ68JjiMV9l84uKKg2rxq87sEHBXmpIls-MC3AimOs/export?format=csv&gid=761897292',
  cost_cz:   'https://docs.google.com/spreadsheets/d/1_MxcTgp5xdbHbNPaUvxklkPlFK28YRcM0ZAbol8X0Y8/export?format=csv&gid=0',
  cost_sk:   'https://docs.google.com/spreadsheets/d/1_MxcTgp5xdbHbNPaUvxklkPlFK28YRcM0ZAbol8X0Y8/export?format=csv&gid=1166854505',
  margin_cz: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vROLHO9ec0unwiL-moal4aGhS_XBRoHBoQhgBltrEP5Li-bJ6vYIJCWLEgDjk02Hlf_eBaoUuy-MWkk/pub?output=csv',
  margin_sk: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vROLHO9ec0unwiL-moal4aGhS_XBRoHBoQhgBltrEP5Li-bJ6vYIJCWLEgDjk02Hlf_eBaoUuy-MWkk/pub?gid=1894375948&output=csv',
};

const DATA_DIR   = path.join(__dirname, '..', 'data');
const LOG_FILE   = path.join(__dirname, 'updateData.log');
const EUR_TO_CZK = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSV(content) {
  const lines = content.split('\n');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (const c of lines[i]) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur);
    result.push(cols);
  }
  return result;
}

const parseNum = s => parseFloat((s || '0').replace(',', '.')) || 0;

// ── Doprava / platba normalization ────────────────────────────────────────────
// In Shoptet exports, shipping + payment lines can appear in the "product name"
// column. Shipping lines often include pickup-point details after " - ".
const SHIPPING_PREFIXES = [
  'Zásilkovna',
  'Zasilkovna',
  'Packeta',
  'Balíkovna',
  'Balikovna',
  'PPL',
  'DPD',
  'GLS',
  'DHL',
  'Česká pošta',
  'Ceska posta',
  'Slovenská pošta',
  'Slovenska posta',
  'Pošta',
  'Posta',
];

function isShippingName(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return false;
  return SHIPPING_PREFIXES.some(p => n === p.toLowerCase() || n.startsWith(p.toLowerCase() + ' '));
}

function isPaymentName(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return false;

  // Common CZ/SK payment methods in Shoptet exports
  if (n.includes('platba')) return true; // e.g. "Online platba kartou"
  if ((n.includes('bankovn') || n.includes('bankov')) && (n.includes('převod') || n.includes('prevod'))) return true; // Bankovní/Bankový převod
  if (n.includes('dobír') || n.includes('dobier')) return true; // Dobírka / Dobírkou / Dobierka / Dobierkou
  if (n.includes('karta') || n.includes('kartou')) return true;
  if (n.includes('hotov')) return true; // Hotově / hotovosť
  if (n.includes('google pay') || n.includes('apple pay')) return true;
  if (n.includes('paypal')) return true;

  return false;
}

function isDeliveryOrPaymentName(name) {
  return isShippingName(name) || isPaymentName(name);
}

function normalizeDeliveryPaymentName(name) {
  const n = (name || '').trim();
  if (!n) return n;

  // Normalize shipping: keep only the carrier/method before " - "
  // Example: "Zásilkovna - 27708 Z-BOX ...": -> "Zásilkovna"
  const dashIdx = n.indexOf(' - ');
  if (dashIdx > 0) {
    const left = n.slice(0, dashIdx).trim();
    if (SHIPPING_PREFIXES.some(p => left.toLowerCase().startsWith(p.toLowerCase()))) {
      return left;
    }
  }

  // Some exports use a colon separator (rare). Handle "Carrier: detail"
  const colonIdx = n.indexOf(': ');
  if (colonIdx > 0) {
    const left = n.slice(0, colonIdx).trim();
    if (SHIPPING_PREFIXES.some(p => left.toLowerCase().startsWith(p.toLowerCase()))) {
      return left;
    }
  }

  return n;
}

// ── Orders processing ─────────────────────────────────────────────────────────
const EXCLUDED_STATUSES = new Set([
  'Stornována', 'Stornovaná', 'Zboží vráceno / nevyzvednuto', 'Vrátené / nevyzdvihnuté',
]);

function aggregateOrders(csv, eurMultiplier = 1) {
  const rows = parseCSV(csv);
  const seen = new Map();
  const byDay = {};

  for (const cols of rows) {
    if (cols.length < 38) continue;
    const code   = cols[0];
    const status = cols[2];
    if (seen.has(code)) continue;
    seen.set(code, true);

    const date = cols[1].substring(0, 10);
    if (!byDay[date]) byDay[date] = { orders: 0, orders_cancelled: 0, revenue_vat: 0, revenue: 0 };

    if (EXCLUDED_STATUSES.has(status)) {
      byDay[date].orders_cancelled++;
      continue;
    }

    byDay[date].orders++;
    byDay[date].revenue_vat += parseNum(cols[36]) * eurMultiplier;
    byDay[date].revenue     += parseNum(cols[37]) * eurMultiplier;
  }
  return byDay;
}

// ── Product processing ────────────────────────────────────────────────────────
function aggregateProducts(csv, eurMultiplier = 1) {
  const rows = parseCSV(csv);

  // Identify all cancelled order codes
  const cancelledCodes = new Set();
  for (const cols of rows) {
    if (cols.length < 3) continue;
    if (EXCLUDED_STATUSES.has(cols[2])) cancelledCodes.add(cols[0]);
  }

  // Aggregate by date + product name
  const byDateProduct = {};
  for (const cols of rows) {
    if (cols.length < 57) continue;
    const code = cols[0];
    if (cancelledCodes.has(code)) continue;

    const date   = cols[1].substring(0, 10);
    const name   = normalizeDeliveryPaymentName(cols[43]);
    const amount = parseNum(cols[44]);
    const revVat = parseNum(cols[55]) * eurMultiplier;
    const rev    = parseNum(cols[56]) * eurMultiplier;

    if (!name || amount <= 0) continue;
    if (isDeliveryOrPaymentName(name)) continue;

    const key = `${date}||${name}`;
    if (!byDateProduct[key]) {
      byDateProduct[key] = { date, name, amount: 0, revenue_vat: 0, revenue: 0 };
    }
    byDateProduct[key].amount      += amount;
    byDateProduct[key].revenue_vat += revVat;
    byDateProduct[key].revenue     += rev;
  }

  return Object.values(byDateProduct)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    .map(r => ({
      ...r,
      revenue_vat: Math.round(r.revenue_vat * 100) / 100,
      revenue:     Math.round(r.revenue     * 100) / 100,
    }));
}

// ── Cost processing ───────────────────────────────────────────────────────────
function aggregateCost(csv, eurMultiplier = 1) {
  const rows = parseCSV(csv);
  const byDay = {};
  const byDaySource = {};

  for (const cols of rows) {
    if (cols.length < 6) continue;
    const date   = cols[1];
    const source = cols[2];
    const cost   = parseNum(cols[4]) * eurMultiplier;
    const clicks = parseNum(cols[5]);

    byDay[date] = (byDay[date] || 0) + cost;
    if (!byDaySource[date]) byDaySource[date] = {};
    if (!byDaySource[date][source]) byDaySource[date][source] = { cost: 0, clicks: 0 };
    byDaySource[date][source].cost   += cost;
    byDaySource[date][source].clicks += clicks;
  }
  return { byDay, byDaySource };
}

// ── Merge orders + cost into daily records ────────────────────────────────────
function mergeDailyRecords(ordersByDay, costByDay, costByDaySource, country) {
  const allDates = new Set([...Object.keys(ordersByDay), ...Object.keys(costByDay)]);
  const records  = [];

  for (const date of [...allDates].sort()) {
    const o       = ordersByDay[date]    || { orders: 0, orders_cancelled: 0, revenue_vat: 0, revenue: 0 };
    const cost    = costByDay[date]      || 0;
    const sources = costByDaySource[date] || {};

    records.push({
      date, country,
      orders:            o.orders,
      orders_cancelled:  o.orders_cancelled,
      revenue_vat:       Math.round(o.revenue_vat * 100) / 100,
      revenue:           Math.round(o.revenue     * 100) / 100,
      cost:              Math.round(cost           * 100) / 100,
      cost_facebook:     Math.round((sources.facebook?.cost   || 0) * 100) / 100,
      cost_google:       Math.round((sources.google?.cost     || 0) * 100) / 100,
      clicks_facebook:   Math.round(sources.facebook?.clicks  || 0),
      clicks_google:     Math.round(sources.google?.clicks    || 0),
    });
  }
  return records;
}

// ── Write product TypeScript data file ───────────────────────────────────────
function writeProductTsFile(filePath, varName, country, records) {
  const today = new Date().toISOString().split('T')[0];
  const content = `// Auto-generated by scripts/updateData.js — last update: ${today}
// ${country.toUpperCase()}: product sales (cancelled/returned excluded)

export interface ProductSaleRecord {
  date: string;
  name: string;
  amount: number;
  revenue_vat: number;
  revenue: number;
}

export const ${varName}: ProductSaleRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Write TypeScript data file ────────────────────────────────────────────────
function writeTsFile(filePath, varName, interfaceName, currencyComment, records) {
  const today = new Date().toISOString().split('T')[0];
  const content = `// Auto-generated by scripts/updateData.js — last update: ${today}
// ${currencyComment}

export interface ${interfaceName} {
  date: string;
  country: '${records[0]?.country || ''}';
  orders: number;
  orders_cancelled: number;
  revenue_vat: number;
  revenue: number;
  cost: number;
  cost_facebook: number;
  cost_google: number;
  clicks_facebook: number;
  clicks_google: number;
}

export const ${varName}: ${interfaceName}[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Margin processing (CZ only) ───────────────────────────────────────────────
// Sheet columns: id, code, date, statusName, orderPurchasePrice, totalPriceWithoutVat
// Each order code may appear multiple times (one row per product line).
// We deduplicate by order code and aggregate purchase cost + revenue by day.
const MARGIN_EXCLUDED_STATUSES = new Set([
  'Stornována', 'Stornovaná', 'Zboží vráceno / nevyzvednuto',
  'Vrátené / nevyzdvihnuté', 'Vrácena',
]);

function aggregateMargin(csv) {
  const rows = parseCSV(csv);
  const seenCodes = new Set();
  const byDay = {};

  for (const cols of rows) {
    if (cols.length < 6) continue;
    const code   = (cols[1] || '').trim();
    const rawDate = (cols[2] || '').trim();
    const status = (cols[3] || '').trim();
    const purchaseCost = parseNum(cols[4]);
    const revenueNoVat = parseNum(cols[5]);

    if (!code || !rawDate) continue;
    if (MARGIN_EXCLUDED_STATUSES.has(status)) continue;
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const date = rawDate.substring(0, 10);
    if (!byDay[date]) byDay[date] = { purchaseCost: 0, revenue: 0 };
    byDay[date].purchaseCost += purchaseCost;
    byDay[date].revenue      += revenueNoVat;
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      purchaseCost: Math.round(v.purchaseCost * 100) / 100,
      revenue:      Math.round(v.revenue      * 100) / 100,
    }));
}

function writeMarginTsFile(filePath, varName, currency, records) {
  const today = new Date().toISOString().split('T')[0];
  const country = varName.endsWith('CZ') ? 'CZ' : 'SK';
  const note = currency === 'EUR'
    ? 'SK: daily margin data (EUR). purchaseCost = nákupní cena (0 = data není k dispozici), revenue = tržby bez DPH.'
    : 'CZ: daily margin data (CZK). purchaseCost = nákupní cena, revenue = tržby bez DPH.';
  const content = `// Auto-generated by scripts/updateData.js — last update: ${today}
// ${note}

export interface MarginDailyRecord {
  date: string;        // ISO "2025-05-25"
  purchaseCost: number; // nákupní cena (součet za den)${currency === 'EUR' ? ' — pro SK vždy 0' : ''}
  revenue: number;      // tržby bez DPH (součet za den)
}

export const ${varName}: MarginDailyRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Cross-sell processing ─────────────────────────────────────────────────────

function aggregateCrossSell(csv) {
  const rows = parseCSV(csv);

  // Identify cancelled orders
  const cancelledCodes = new Set();
  for (const cols of rows) {
    if (cols.length < 3) continue;
    if (EXCLUDED_STATUSES.has(cols[2])) cancelledCodes.add(cols[0]);
  }

  // Group distinct product names by order code
  const orderProducts = new Map();
  for (const cols of rows) {
    if (cols.length < 57) continue;
    const code = cols[0];
    if (cancelledCodes.has(code)) continue;

    const name   = normalizeDeliveryPaymentName(cols[43]);
    const amount = parseNum(cols[44]);

    if (!name || amount <= 0) continue;
    if (isDeliveryOrPaymentName(name)) continue;

    if (!orderProducts.has(code)) orderProducts.set(code, new Set());
    orderProducts.get(code).add(name);
  }

  // Count product pairs across orders
  const pairCounts = new Map();
  let totalOrders = 0;
  let multiItemOrders = 0;

  for (const products of orderProducts.values()) {
    const arr = [...products].sort();
    totalOrders++;
    if (arr.length < 2) continue;
    multiItemOrders++;

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = `${arr[i]}|||${arr[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  // Sort by frequency, keep top 100 pairs
  const pairs = [...pairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([key, count]) => {
      const sep = key.indexOf('|||');
      return {
        productA: key.slice(0, sep),
        productB: key.slice(sep + 3),
        count,
        pct: totalOrders > 0 ? Math.round((count / totalOrders) * 10000) / 100 : 0,
      };
    });

  return { totalOrders, multiItemOrders, pairs };
}

function writeCrossSellTsFile(filePath, varName, country, data) {
  const today = new Date().toISOString().split('T')[0];
  const currency = country === 'cz' ? 'CZK' : 'EUR';
  const content = `// Auto-generated by scripts/updateData.js — last update: ${today}
// ${country.toUpperCase()}: product pair co-occurrence from order export

export interface CrossSellPair {
  productA: string;
  productB: string;
  count: number;   // number of orders containing both products
  pct: number;     // % of total orders
}

export interface CrossSellData {
  totalOrders: number;
  multiItemOrders: number;
  pairs: CrossSellPair[];
}

export const ${varName}: CrossSellData = ${JSON.stringify(data, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Retention processing ──────────────────────────────────────────────────────
const EMAIL_COL = 5; // sloupec "email" v Shoptet exportu

function aggregateRetention(csv) {
  const rows = parseCSV(csv);
  const byCustomer = new Map();
  const seenOrderCodes = new Set();

  for (const cols of rows) {
    if (cols.length < 38) continue;
    const code   = cols[0];
    const status = cols[2];
    const email  = (cols[EMAIL_COL] || '').trim().toLowerCase();

    if (!email) continue;

    // Skip cancelled orders
    if (EXCLUDED_STATUSES.has(status)) continue;

    // Each order code may appear multiple times (one row per product)
    // Only process financial data from first occurrence
    if (seenOrderCodes.has(code)) continue;
    seenOrderCodes.add(code);

    const date   = cols[1].substring(0, 10);
    const revVat = parseNum(cols[36]);
    const rev    = parseNum(cols[37]);

    if (revVat <= 0) continue; // skip zero-value orders

    if (!byCustomer.has(email)) {
      byCustomer.set(email, { dates: [], revenues: [], revsVat: [] });
    }
    const c = byCustomer.get(email);
    c.dates.push(date);
    c.revenues.push(rev);
    c.revsVat.push(revVat);
  }

  // Sort each customer's orders by date
  const result = [];
  for (const c of byCustomer.values()) {
    const sorted = c.dates.map((d, i) => ({ d, r: c.revenues[i], rv: c.revsVat[i] }))
      .sort((a, b) => a.d.localeCompare(b.d));
    result.push({
      dates:    sorted.map(x => x.d),
      revenues: sorted.map(x => Math.round(x.r  * 100) / 100),
      revsVat:  sorted.map(x => Math.round(x.rv * 100) / 100),
    });
  }
  return result;
}

function writeRetentionTsFile(filePath, varName, country, records) {
  const today = new Date().toISOString().split('T')[0];
  const content = `// Auto-generated by scripts/updateData.js — last update: ${today}
// ${country.toUpperCase()}: per-customer retention data (${country === 'cz' ? 'CZK' : 'EUR'})

export const ${varName}: { dates: string[]; revenues: number[]; revsVat: number[] }[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('=== Data update started ===');

  try {
    // Download all sheets in parallel
    log('Downloading Google Sheets...');
    const [csvOrdersCZ, csvOrdersSK, csvCostCZ, csvCostSK, csvMarginCZ, csvMarginSK] = await Promise.all([
      fetchUrl(SHEETS.orders_cz),
      fetchUrl(SHEETS.orders_sk),
      fetchUrl(SHEETS.cost_cz),
      fetchUrl(SHEETS.cost_sk),
      fetchUrl(SHEETS.margin_cz),
      fetchUrl(SHEETS.margin_sk),
    ]);
    log('Download complete.');

    // ── CZ ────────────────────────────────────────────────────────────────────
    const ordersByDayCZ             = aggregateOrders(csvOrdersCZ, 1);          // CZK
    const { byDay: costByDayCZ, byDaySource: costSrcCZ } = aggregateCost(csvCostCZ, 1); // CZK
    const recordsCZ = mergeDailyRecords(ordersByDayCZ, costByDayCZ, costSrcCZ, 'cz');

    const totalCZ = recordsCZ.reduce((a, r) => ({
      orders: a.orders + r.orders,
      revenue_vat: a.revenue_vat + r.revenue_vat,
      cost: a.cost + r.cost,
    }), { orders: 0, revenue_vat: 0, cost: 0 });

    log(`CZ: ${recordsCZ.length} days | ${totalCZ.orders} orders | ${totalCZ.revenue_vat.toFixed(0)} Kč | PNO ${(totalCZ.cost / (recordsCZ.reduce((s,r) => s+r.revenue, 0)) * 100).toFixed(2)}%`);

    writeTsFile(
      path.join(DATA_DIR, 'realDataCZ.ts'),
      'realDataCZ', 'RealDailyRecord',
      'CZ: orders in CZK (cancelled/returned excluded)',
      recordsCZ
    );
    log('Written realDataCZ.ts');

    const productsCZ = aggregateProducts(csvOrdersCZ, 1);
    writeProductTsFile(path.join(DATA_DIR, 'productDataCZ.ts'), 'productDataCZ', 'cz', productsCZ);
    log(`CZ products: ${productsCZ.reduce((s, r) => s + r.amount, 0)} ks across ${new Set(productsCZ.map(r => r.name)).size} unique products`);
    log('Written productDataCZ.ts');

    // ── SK ────────────────────────────────────────────────────────────────────
    const ordersByDaySK             = aggregateOrders(csvOrdersSK, 1);          // EUR
    const { byDay: costByDaySK, byDaySource: costSrcSK } = aggregateCost(csvCostSK, 1); // EUR
    const recordsSK = mergeDailyRecords(ordersByDaySK, costByDaySK, costSrcSK, 'sk');

    const totalSK = recordsSK.reduce((a, r) => ({
      orders: a.orders + r.orders,
      revenue_vat: a.revenue_vat + r.revenue_vat,
      cost: a.cost + r.cost,
    }), { orders: 0, revenue_vat: 0, cost: 0 });

    log(`SK: ${recordsSK.length} days | ${totalSK.orders} orders | ${totalSK.revenue_vat.toFixed(2)} € | PNO ${(totalSK.cost / (recordsSK.reduce((s,r) => s+r.revenue, 0)) * 100).toFixed(2)}%`);

    writeTsFile(
      path.join(DATA_DIR, 'realDataSK.ts'),
      'realDataSK', 'RealDailyRecordSK',
      'SK: orders in EUR (cancelled/returned excluded), costs in EUR',
      recordsSK
    );
    log('Written realDataSK.ts');

    const productsSK = aggregateProducts(csvOrdersSK, 1);
    writeProductTsFile(path.join(DATA_DIR, 'productDataSK.ts'), 'productDataSK', 'sk', productsSK);
    log(`SK products: ${productsSK.reduce((s, r) => s + r.amount, 0)} ks across ${new Set(productsSK.map(r => r.name)).size} unique products`);
    log('Written productDataSK.ts');

    // ── CZ retention ──────────────────────────────────────────────────────────
    const retentionCZ = aggregateRetention(csvOrdersCZ);
    writeRetentionTsFile(path.join(DATA_DIR, 'retentionDataCZ.ts'), 'retentionDataCZ', 'cz', retentionCZ);
    log(`CZ retention: ${retentionCZ.length} customers`);

    // ── SK retention ──────────────────────────────────────────────────────────
    const retentionSK = aggregateRetention(csvOrdersSK);
    writeRetentionTsFile(path.join(DATA_DIR, 'retentionDataSK.ts'), 'retentionDataSK', 'sk', retentionSK);
    log(`SK retention: ${retentionSK.length} customers`);

    // ── CZ cross-sell ─────────────────────────────────────────────────────────
    const crossSellCZ = aggregateCrossSell(csvOrdersCZ);
    writeCrossSellTsFile(path.join(DATA_DIR, 'crossSellDataCZ.ts'), 'crossSellDataCZ', 'cz', crossSellCZ);
    log(`CZ cross-sell: ${crossSellCZ.pairs.length} pairs from ${crossSellCZ.totalOrders} orders (${crossSellCZ.multiItemOrders} multi-item)`);

    // ── SK cross-sell ─────────────────────────────────────────────────────────
    const crossSellSK = aggregateCrossSell(csvOrdersSK);
    writeCrossSellTsFile(path.join(DATA_DIR, 'crossSellDataSK.ts'), 'crossSellDataSK', 'sk', crossSellSK);
    log(`SK cross-sell: ${crossSellSK.pairs.length} pairs from ${crossSellSK.totalOrders} orders (${crossSellSK.multiItemOrders} multi-item)`);

    // ── CZ Margin ──────────────────────────────────────────────────────────────
    const marginRecordsCZ = aggregateMargin(csvMarginCZ);
    writeMarginTsFile(path.join(DATA_DIR, 'marginDataCZ.ts'), 'marginDataCZ', 'CZK', marginRecordsCZ);
    const totalMarginCZ = marginRecordsCZ.reduce((s, r) => s + (r.revenue - r.purchaseCost), 0);
    log(`CZ margin: ${marginRecordsCZ.length} days | marže ${totalMarginCZ.toFixed(0)} Kč`);
    log('Written marginDataCZ.ts');

    // ── SK Margin ──────────────────────────────────────────────────────────────
    // SK sheet má stejný formát, ale orderPurchasePrice je prázdné → purchaseCost=0
    const marginRecordsSK = aggregateMargin(csvMarginSK);
    writeMarginTsFile(path.join(DATA_DIR, 'marginDataSK.ts'), 'marginDataSK', 'EUR', marginRecordsSK);
    const totalRevSK = marginRecordsSK.reduce((s, r) => s + r.revenue, 0);
    log(`SK margin: ${marginRecordsSK.length} days | revenue ${totalRevSK.toFixed(2)} € (nákupní ceny nejsou k dispozici)`);
    log('Written marginDataSK.ts');

    log('=== Data update finished successfully ===');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
