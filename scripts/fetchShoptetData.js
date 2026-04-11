/**
 * fetchShoptetData.js
 * Fetches orders from Shoptet Private API (AT) and generates data/*.ts files.
 *
 * Run:  node scripts/fetchShoptetData.js           # incremental (last 7 days)
 *       node scripts/fetchShoptetData.js --full    # full sync (all orders)
 *
 * Requires env var: SHOPTET_API_TOKEN_AT
 * Or set it directly in .env.local as SHOPTET_API_TOKEN_AT=...
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────
// Load .env.local if present (simple key=value parser, no package needed)
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join('=').trim();
    }
  });
}

const API_TOKEN      = process.env.SHOPTET_API_TOKEN_AT;
const API_BASE       = 'https://api.myshoptet.com/api';
const DATA_DIR       = path.join(__dirname, '..', 'data');
const CACHE_FILE     = path.join(__dirname, 'orders_cache_at.json');
const LOG_FILE       = path.join(__dirname, 'fetchShoptetData.log');

const FULL_SYNC       = process.argv.includes('--full');
const INCREMENTAL_DAYS = 7;   // days to look back for incremental sync
const BATCH_SIZE      = 10;   // concurrent detail requests
const ITEMS_PER_PAGE  = 100;

// Status IDs that mean cancelled (Abgesagt)
const CANCELLED_STATUS_IDS = new Set([-4]);

if (!API_TOKEN) {
  console.error('ERROR: SHOPTET_API_TOKEN_AT env variable is not set.');
  console.error('Add it to .env.local or set it as an environment variable.');
  process.exit(1);
}

// ── Logging ────────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function apiGet(endpoint, retries = 3) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${endpoint}`;
    const options = {
      headers: {
        'Shoptet-Private-API-Token': API_TOKEN,
        'Content-Type': 'application/json',
      },
    };
    const attempt = (n) => {
      https.get(url, options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode === 429 || res.statusCode >= 500) {
            if (n > 0) {
              log(`HTTP ${res.statusCode} for ${endpoint}, retrying (${n} left)...`);
              setTimeout(() => attempt(n - 1), 2000);
              return;
            }
            return reject(new Error(`HTTP ${res.statusCode} for ${endpoint}`));
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (body.errors && body.errors.length) {
              return reject(new Error(`API error for ${endpoint}: ${JSON.stringify(body.errors)}`));
            }
            resolve(body.data);
          } catch (e) {
            reject(new Error(`JSON parse error for ${endpoint}: ${e.message}`));
          }
        });
        res.on('error', reject);
      }).on('error', (e) => {
        if (n > 0) {
          log(`Network error for ${endpoint}, retrying (${n} left)...`);
          setTimeout(() => attempt(n - 1), 2000);
        } else {
          reject(e);
        }
      });
    };
    attempt(retries);
  });
}

// ── Batch executor ─────────────────────────────────────────────────────────────
async function runBatches(items, fn, batchSize, label) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if ((i + batchSize) % 500 === 0 || i + batchSize >= items.length) {
      log(`${label}: ${Math.min(i + batchSize, items.length)} / ${items.length}`);
    }
  }
  return results;
}

// ── Fetch order list pages ─────────────────────────────────────────────────────
async function fetchOrderCodes(fromDate) {
  const codes = [];
  let page = 1;
  let totalPages = 1;

  const dateParam = fromDate
    ? `&changeTimeFrom=${encodeURIComponent(fromDate.toISOString())}`
    : '';

  do {
    const data = await apiGet(`/orders?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}${dateParam}`);
    const orders = data.orders || [];
    orders.forEach(o => codes.push(o.code));
    totalPages = data.paginator.pageCount;
    page++;
  } while (page <= totalPages);

  return codes;
}

// ── Fetch single order detail ──────────────────────────────────────────────────
async function fetchOrderDetail(code) {
  const data = await apiGet(`/orders/${code}`);
  return data.order;
}

// ── Cache helpers ──────────────────────────────────────────────────────────────
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      log('Cache file corrupt, starting fresh.');
    }
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
}

// ── Date helpers ───────────────────────────────────────────────────────────────
// creationTime is ISO with offset e.g. "2026-04-10T20:58:53+0200"
// We take the date portion directly — it's already in local (AT) time.
function isoDate(creationTime) {
  return creationTime.substring(0, 10);
}

function parseHour(creationTime) {
  return parseInt(creationTime.substring(11, 13), 10);
}

// dayOfWeek from ISO timestamp (0 = Sunday … 6 = Saturday)
function parseDayOfWeek(creationTime) {
  // Use the date portion in local time. JS Date parses ISO 8601 with offset correctly.
  return new Date(creationTime).getDay();
}

const parseNum = (s) => parseFloat(s || '0') || 0;

// ── Process all cached orders into aggregated datasets ─────────────────────────
function processOrders(orders) {
  const byDay          = {}; // date → DailyRecord
  const byProduct      = {}; // `${date}|${name}` → ProductSaleRecord
  const byMarginDay    = {}; // date → { revenue, purchaseCost }
  const hourlyCells    = {}; // `${dow}|${hour}` → { totalRevenue, totalOrders, dates: Set }
  const crossSellMap   = {}; // `${A}|||${B}` → count
  const retentionMap   = {}; // customerGuid → { dates[], revenues[], revsVat[] }
  const orderValues    = []; // { date, value }[]
  const shippingPayMap = {}; // `${date}|shipping|${name}` → ShippingPaymentRecord

  let totalOrders = 0;
  let multiItemOrders = 0;

  for (const order of orders) {
    const date      = isoDate(order.creationTime);
    const cancelled = CANCELLED_STATUS_IDS.has(order.status.id);
    const items     = order.items || [];

    // --- Cancelled order tracking ---
    if (!byDay[date]) byDay[date] = { date, orders: 0, orders_cancelled: 0, revenue_vat: 0, revenue: 0, cost: 0, cost_facebook: 0, cost_google: 0, clicks_facebook: 0, clicks_google: 0 };

    if (cancelled) {
      byDay[date].orders_cancelled++;
      continue; // skip rest for cancelled orders
    }

    // ── Non-cancelled order ──────────────────────────────────────────────────
    byDay[date].orders++;
    totalOrders++;

    const productItems = items.filter(i => i.itemType === 'product');
    if (productItems.length >= 2) multiItemOrders++;

    // Revenue = sum of product items only (excluding shipping/billing/gift)
    let orderRevenue    = 0;
    let orderRevenueVat = 0;
    let orderPurchaseCost = 0;

    for (const item of productItems) {
      const rev    = parseNum(item.itemPrice?.withoutVat);
      const revVat = parseNum(item.itemPrice?.withVat);
      const cost   = parseNum(item.purchasePrice?.withoutVat);
      const qty    = parseNum(item.amount);
      const name   = (item.name || '').trim();

      orderRevenue    += rev;
      orderRevenueVat += revVat;
      orderPurchaseCost += cost;

      byDay[date].revenue     += rev;
      byDay[date].revenue_vat += revVat;

      // Products
      const pk = `${date}|${name}`;
      if (!byProduct[pk]) byProduct[pk] = { date, name, amount: 0, revenue_vat: 0, revenue: 0 };
      byProduct[pk].amount      += qty;
      byProduct[pk].revenue_vat += revVat;
      byProduct[pk].revenue     += rev;
    }

    // Margin
    if (!byMarginDay[date]) byMarginDay[date] = { date, revenue: 0, purchaseCost: 0 };
    byMarginDay[date].revenue      += orderRevenue;
    byMarginDay[date].purchaseCost += orderPurchaseCost;

    // Hourly
    const hour = parseHour(order.creationTime);
    const dow  = parseDayOfWeek(order.creationTime);
    const hk   = `${dow}|${hour}`;
    if (!hourlyCells[hk]) hourlyCells[hk] = { dayOfWeek: dow, hour, totalRevenue: 0, totalOrders: 0, dates: new Set() };
    hourlyCells[hk].totalRevenue += orderRevenue;
    hourlyCells[hk].totalOrders++;
    hourlyCells[hk].dates.add(date);

    // Cross-sell — pairs of product names within same order
    const names = productItems.map(i => (i.name || '').trim()).filter(Boolean);
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const [pA, pB] = [names[a], names[b]].sort();
        const ck = `${pA}|||${pB}`;
        crossSellMap[ck] = (crossSellMap[ck] || 0) + 1;
      }
    }

    // Retention — group by customerGuid (fallback to email)
    const custKey = order.customerGuid || order.email || 'unknown';
    if (!retentionMap[custKey]) retentionMap[custKey] = { dates: [], revenues: [], revsVat: [] };
    const ret = retentionMap[custKey];
    ret.dates.push(date);
    ret.revenues.push(parseNum(order.price?.withoutVat) - (items.find(i => i.itemType === 'shipping') ? parseNum(items.find(i => i.itemType === 'shipping').itemPrice?.withoutVat) : 0));
    ret.revsVat.push(parseNum(order.price?.withVat) - (items.find(i => i.itemType === 'shipping') ? parseNum(items.find(i => i.itemType === 'shipping').itemPrice?.withVat) : 0));

    // Order value — basket without shipping/billing (product items only)
    orderValues.push({ date, value: orderRevenue });

    // Shipping & payment
    const shippingName = order.shipping?.name || 'Unbekannt';
    const paymentName  = order.paymentMethod?.name || 'Unbekannt';

    const shippingItem = items.find(i => i.itemType === 'shipping');
    const shippingRevVat = parseNum(shippingItem?.itemPrice?.withVat);

    const sk = `${date}|shipping|${shippingName}`;
    if (!shippingPayMap[sk]) shippingPayMap[sk] = { date, type: 'shipping', name: shippingName, count: 0, revenue_vat: 0 };
    shippingPayMap[sk].count++;
    shippingPayMap[sk].revenue_vat += shippingRevVat;

    const pk2 = `${date}|payment|${paymentName}`;
    if (!shippingPayMap[pk2]) shippingPayMap[pk2] = { date, type: 'payment', name: paymentName, count: 0, revenue_vat: 0 };
    shippingPayMap[pk2].count++;
  }

  // Compute dayCount for hourly grid (number of unique dates per dow)
  const dowDates = {}; // dow → Set<date>
  for (const order of orders) {
    if (CANCELLED_STATUS_IDS.has(order.status.id)) continue;
    const dow  = parseDayOfWeek(order.creationTime);
    const date = isoDate(order.creationTime);
    if (!dowDates[dow]) dowDates[dow] = new Set();
    dowDates[dow].add(date);
  }

  const hourlyData = Object.values(hourlyCells).map(cell => {
    const dayCount = (dowDates[cell.dayOfWeek]?.size) || 1;
    return {
      dayOfWeek:   cell.dayOfWeek,
      hour:        cell.hour,
      dayCount,
      totalRevenue: cell.totalRevenue,
      totalOrders:  cell.totalOrders,
      avgRevenue:   cell.totalRevenue / dayCount,
      avgOrders:    cell.totalOrders  / dayCount,
    };
  });

  // Cross-sell pairs — top 100
  const crossSellPairs = Object.entries(crossSellMap)
    .map(([key, count]) => {
      const [productA, productB] = key.split('|||');
      return { productA, productB, count, pct: totalOrders > 0 ? count / totalOrders * 100 : 0 };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  return {
    byDay,
    products:       Object.values(byProduct),
    marginByDay:    Object.values(byMarginDay),
    hourlyData,
    crossSell:      { totalOrders, multiItemOrders, pairs: crossSellPairs },
    retention:      Object.values(retentionMap),
    orderValues,
    shippingPayment: Object.values(shippingPayMap),
  };
}

// ── TS file writers ────────────────────────────────────────────────────────────
const now = new Date().toISOString().substring(0, 10);

function sortByDate(arr) {
  return arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

function writeRealData(byDay) {
  const records = sortByDate(Object.values(byDay));
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: orders in EUR (cancelled excluded)

export interface RealDailyRecord {
  date: string;
  country: 'at';
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

export const realDataAT: RealDailyRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'realDataAT.ts'), content, 'utf8');
  log(`realDataAT.ts: ${records.length} days`);
}

function writeProductData(products) {
  const records = sortByDate(products);
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: product sales (cancelled excluded)

export interface ProductSaleRecord {
  date: string;
  name: string;
  amount: number;
  revenue_vat: number;
  revenue: number;
}

export const productDataAT: ProductSaleRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'productDataAT.ts'), content, 'utf8');
  log(`productDataAT.ts: ${records.length} records`);
}

function writeMarginData(marginByDay) {
  const records = sortByDate(marginByDay);
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: daily margin data (EUR). purchaseCost = nákupní cena, revenue = tržby bez DPH.

export interface MarginDailyRecord {
  date: string;
  purchaseCost: number;
  revenue: number;
}

export const marginDataAT: MarginDailyRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'marginDataAT.ts'), content, 'utf8');
  log(`marginDataAT.ts: ${records.length} days`);
}

function writeHourlyData(hourlyData) {
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: hourly purchase behaviour (EUR), all-time

export interface HourlyPoint {
  dayOfWeek:    number;  // 0 = Sunday … 6 = Saturday
  hour:         number;  // 0–23
  dayCount:     number;
  totalRevenue: number;
  totalOrders:  number;
  avgRevenue:   number;
  avgOrders:    number;
}

export const hourlyDataAT: HourlyPoint[] = ${JSON.stringify(hourlyData, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'hourlyDataAT.ts'), content, 'utf8');
  log(`hourlyDataAT.ts: ${hourlyData.length} cells`);
}

function writeCrossSellData(crossSell) {
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: product pair co-occurrence from orders

export interface CrossSellPair {
  productA: string;
  productB: string;
  count: number;
  pct: number;
}

export interface CrossSellData {
  totalOrders: number;
  multiItemOrders: number;
  pairs: CrossSellPair[];
}

export const crossSellDataAT: CrossSellData = ${JSON.stringify(crossSell, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'crossSellDataAT.ts'), content, 'utf8');
  log(`crossSellDataAT.ts: ${crossSell.pairs.length} pairs`);
}

function writeRetentionData(retention) {
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: per-customer retention data (EUR)

export const retentionDataAT: { dates: string[]; revenues: number[]; revsVat: number[] }[] = ${JSON.stringify(retention, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'retentionDataAT.ts'), content, 'utf8');
  log(`retentionDataAT.ts: ${retention.length} customers`);
}

function writeOrderValueData(orderValues) {
  const records = sortByDate(orderValues);
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: per-order product basket value bez DPH (EUR), cancelled excluded

export interface OrderValueRecord {
  date: string;
  value: number;
}

export const orderValueDataAT: OrderValueRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'orderValueDataAT.ts'), content, 'utf8');
  log(`orderValueDataAT.ts: ${records.length} orders`);
}

function writeShippingPaymentData(shippingPayment) {
  const records = sortByDate(shippingPayment);
  const content = `// Auto-generated by scripts/fetchShoptetData.js — last update: ${now}
// AT: shipping and payment methods per day (EUR, cancelled excluded)

export interface ShippingPaymentRecord {
  date: string;
  type: 'shipping' | 'payment';
  name: string;
  count: number;
  revenue_vat: number;
}

export const shippingPaymentDataAT: ShippingPaymentRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'shippingPaymentDataAT.ts'), content, 'utf8');
  log(`shippingPaymentDataAT.ts: ${records.length} records`);
}

function writeLastUpdate() {
  const ts = new Date().toISOString();
  const content = `// Auto-generated — do not edit manually
export const lastUpdate = '${ts}';
`;
  fs.writeFileSync(path.join(DATA_DIR, 'lastUpdate.ts'), content, 'utf8');
  log(`lastUpdate.ts: ${ts}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log(`=== fetchShoptetData.js START (${FULL_SYNC ? 'FULL SYNC' : 'INCREMENTAL'}) ===`);

  // 1. Determine which order codes to fetch
  let codesToFetch;
  const cacheExists = fs.existsSync(CACHE_FILE);

  if (FULL_SYNC || !cacheExists) {
    log('Fetching ALL order codes (full sync)...');
    codesToFetch = await fetchOrderCodes(null);
    log(`Total orders found: ${codesToFetch.length}`);
  } else {
    const fromDate = new Date(Date.now() - INCREMENTAL_DAYS * 24 * 60 * 60 * 1000);
    log(`Fetching orders changed since ${fromDate.toISOString()}...`);
    codesToFetch = await fetchOrderCodes(fromDate);
    log(`Orders to update: ${codesToFetch.length}`);
  }

  // 2. Fetch order details in batches
  log(`Fetching ${codesToFetch.length} order details (batch size: ${BATCH_SIZE})...`);
  const fetchedOrders = await runBatches(
    codesToFetch,
    async (code) => {
      try {
        return await fetchOrderDetail(code);
      } catch (e) {
        log(`WARNING: Failed to fetch order ${code}: ${e.message}`);
        return null;
      }
    },
    BATCH_SIZE,
    'Order details'
  );

  // 3. Merge into cache
  const cache = loadCache();
  let updated = 0;
  for (const order of fetchedOrders) {
    if (order) {
      cache[order.code] = order;
      updated++;
    }
  }
  log(`Updated ${updated} orders in cache. Total cached: ${Object.keys(cache).length}`);
  saveCache(cache);

  // 4. Process all cached orders
  const allOrders = Object.values(cache);
  log(`Processing ${allOrders.length} orders...`);
  const aggregated = processOrders(allOrders);

  // 5. Write all data files
  writeRealData(aggregated.byDay);
  writeProductData(aggregated.products);
  writeMarginData(aggregated.marginByDay);
  writeHourlyData(aggregated.hourlyData);
  writeCrossSellData(aggregated.crossSell);
  writeRetentionData(aggregated.retention);
  writeOrderValueData(aggregated.orderValues);
  writeShippingPaymentData(aggregated.shippingPayment);
  writeLastUpdate();

  log('=== fetchShoptetData.js DONE ===');
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
