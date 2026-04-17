/**
 * fetchShoptetDataCZ.js
 * Fetches orders from Shoptet Private API (CZ) and generates data/*.ts files.
 *
 * Run:  node scripts/fetchShoptetDataCZ.js           # incremental (last 7 days)
 *       node scripts/fetchShoptetDataCZ.js --full    # full sync (all orders from 2025-01-01)
 *
 * Requires env var: SHOPTET_API_TOKEN_CZ
 * Or set it directly in .env.local as SHOPTET_API_TOKEN_CZ=...
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const v8    = require('v8');

// ── Config ─────────────────────────────────────────────────────────────────────
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join('=').trim();
    }
  });
}

const API_TOKEN      = process.env.SHOPTET_API_TOKEN_CZ;
const API_BASE       = 'https://api.myshoptet.com/api';
const DATA_DIR       = path.join(__dirname, '..', 'data');
const CACHE_FILE     = path.join(__dirname, 'orders_cache_cz.json');
const CATEGORY_MAP_CACHE = path.join(__dirname, 'category_map_cz.json');
const LOG_FILE       = path.join(__dirname, 'fetchShoptetDataCZ.log');

const FULL_SYNC        = process.argv.includes('--full');
const INCREMENTAL_DAYS = 10;
const BATCH_SIZE       = 3;
const BATCH_DELAY_MS   = 500;
const ITEMS_PER_PAGE   = 100;
const CATEGORY_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const CATEGORY_MAP_VERSION = 2;

// Status IDs that mean cancelled (Stornována)
const CANCELLED_STATUS_IDS = new Set([-4]);

if (!API_TOKEN) {
  console.error('ERROR: SHOPTET_API_TOKEN_CZ env variable is not set.');
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
              setTimeout(() => attempt(n - 1), 4000);
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
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return results;
}

// ── Fetch all categories → build guid→{ root, sub } map ──────────────────────
async function fetchCategoryHierarchy() {
  const all = [];
  let page = 1, totalPages = 1;
  do {
    const data = await apiGet(`/categories?itemsPerPage=100&page=${page}`);
    const cats = data.categories || data.data?.categories || [];
    all.push(...cats);
    totalPages = data.paginator?.pageCount || data.data?.paginator?.pageCount || 1;
    page++;
  } while (page <= totalPages);

  const nameOf = {};
  const parentOf = {};
  for (const c of all) {
    nameOf[c.guid]   = c.name;
    parentOf[c.guid] = c.parentGuid || null;
  }

  function findRoot(guid) {
    let cur = guid;
    const visited = new Set();
    while (parentOf[cur] && !visited.has(cur)) { visited.add(cur); cur = parentOf[cur]; }
    return cur;
  }

  function findLevel2(guid) {
    let cur = guid;
    const visited = new Set();
    while (parentOf[cur] && parentOf[parentOf[cur]] && !visited.has(cur)) { visited.add(cur); cur = parentOf[cur]; }
    return parentOf[cur] ? cur : null;
  }

  const guidToHierarchy = {};
  for (const c of all) {
    const rootGuid   = findRoot(c.guid);
    const level2Guid = findLevel2(c.guid);
    guidToHierarchy[c.guid] = {
      root: nameOf[rootGuid] || c.name,
      sub:  level2Guid ? (nameOf[level2Guid] || '') : '',
    };
  }
  return guidToHierarchy;
}

// ── Fetch all products → build productGuid→{ root, sub, brand } map ──────────
async function buildProductCategoryMap() {
  if (fs.existsSync(CATEGORY_MAP_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CATEGORY_MAP_CACHE, 'utf8'));
      const age = Date.now() - (cached._ts || 0);
      if (age < CATEGORY_MAP_TTL_MS && cached._version === CATEGORY_MAP_VERSION) {
        log(`Category map cache valid (${Math.round(age / 60000)} min old), skipping re-fetch.`);
        delete cached._ts; delete cached._version;
        return cached;
      }
    } catch { /* re-fetch */ }
  }

  log('Building product→category map...');
  const guidToHierarchy = await fetchCategoryHierarchy();
  log(`Categories fetched: ${Object.keys(guidToHierarchy).length}`);

  const productMap = {};
  let page = 1, totalPages = 1;
  do {
    const data = await apiGet(`/products?itemsPerPage=100&page=${page}`);
    const prods = data.products || data.data?.products || [];
    totalPages = data.paginator?.pageCount || data.data?.paginator?.pageCount || 1;
    for (const p of prods) {
      const catGuid = p.defaultCategory?.guid;
      const brand   = (p.brand?.name || '').trim();
      const catInfo = catGuid
        ? (guidToHierarchy[catGuid] || { root: p.defaultCategory.name, sub: '' })
        : { root: 'Nezařazeno', sub: '' };
      productMap[p.guid] = { ...catInfo, brand };
    }
    if (page % 10 === 0 || page === totalPages) log(`Products: ${page}/${totalPages} pages`);
    page++;
  } while (page <= totalPages);

  log(`Product→category map: ${Object.keys(productMap).length} products`);
  fs.writeFileSync(CATEGORY_MAP_CACHE, JSON.stringify({ ...productMap, _ts: Date.now(), _version: CATEGORY_MAP_VERSION }), 'utf8');
  return productMap;
}

// ── Fetch all order list pages ─────────────────────────────────────────────────
async function fetchOrderCodes(fromDate) {
  const codes = [];
  let page = 1, totalPages = 1;

  function toApiDate(d) {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}${mm}`;
  }

  const dateParam = fromDate ? `&changeTimeFrom=${encodeURIComponent(toApiDate(fromDate))}` : '';

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
    try { return v8.deserialize(fs.readFileSync(CACHE_FILE)); }
    catch { log('Cache file corrupt, starting fresh.'); }
  }
  return {};
}

function saveCache(cache) {
  const tmpFile = CACHE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, v8.serialize(cache));
  fs.renameSync(tmpFile, CACHE_FILE);
}

// ── Date helpers ───────────────────────────────────────────────────────────────
function isoDate(creationTime) { return creationTime.substring(0, 10); }
function parseHour(creationTime) { return parseInt(creationTime.substring(11, 13), 10); }
function parseDayOfWeek(creationTime) { return new Date(creationTime).getDay(); }
const parseNum = (s) => parseFloat(s || '0') || 0;

// ── Process all cached orders into aggregated datasets ─────────────────────────
function processOrders(orders, productCategoryMap = {}) {
  const byDay          = {};
  const byProduct      = {};
  const byCategory     = {};
  const byBrand        = {};
  const byMarginDay    = {};
  const hourlyCells    = {};
  const crossSellMap   = {};
  const retentionMap   = {};
  const orderValues    = [];
  const shippingPayMap = {};

  let totalOrders = 0;
  let multiItemOrders = 0;

  for (const order of orders) {
    const date      = isoDate(order.creationTime);
    const cancelled = CANCELLED_STATUS_IDS.has(order.status.id);
    const items     = order.items || [];

    if (!byDay[date]) byDay[date] = { date, country: 'cz', orders: 0, orders_cancelled: 0, revenue_vat: 0, revenue: 0, cost: 0, cost_facebook: 0, cost_google: 0, clicks_facebook: 0, clicks_google: 0 };

    if (cancelled) {
      byDay[date].orders_cancelled++;
      continue;
    }

    byDay[date].orders++;
    totalOrders++;

    const productItems = items.filter(i => i.itemType === 'product');
    if (productItems.length >= 2) multiItemOrders++;

    let orderRevenue    = 0;
    let orderRevenueVat = 0;
    let orderPurchaseCost = 0;

    for (const item of productItems) {
      const rev    = parseNum(item.itemPrice?.withoutVat);
      const revVat = parseNum(item.itemPrice?.withVat);
      const cost   = parseNum(item.purchasePrice?.withoutVat);
      const qty    = parseNum(item.amount);
      const name   = (item.name || '').trim();

      orderRevenue      += rev;
      orderRevenueVat   += revVat;
      orderPurchaseCost += cost * qty;

      byDay[date].revenue     += rev;
      byDay[date].revenue_vat += revVat;

      // Products
      const pk = `${date}|${name}`;
      if (!byProduct[pk]) byProduct[pk] = { date, name, amount: 0, revenue_vat: 0, revenue: 0 };
      byProduct[pk].amount      += qty;
      byProduct[pk].revenue_vat += revVat;
      byProduct[pk].revenue     += rev;

      // Categories
      const catEntry = (item.productGuid && productCategoryMap[item.productGuid])
        ? productCategoryMap[item.productGuid]
        : { root: 'Nezařazeno', sub: '' };
      const rootCat = catEntry.root || 'Nezařazeno';
      const subCat  = catEntry.sub  || '';
      const ck = `${date}|${rootCat}|${subCat}`;
      if (!byCategory[ck]) byCategory[ck] = { date, category: rootCat, subCategory: subCat, revenue: 0, purchaseCost: 0, quantity: 0 };
      byCategory[ck].revenue      += rev;
      byCategory[ck].purchaseCost += cost * qty;
      byCategory[ck].quantity     += qty;

      // Brands
      const brand = ((item.productGuid && productCategoryMap[item.productGuid]?.brand) || '').trim() || 'Nezařazeno';
      const bk = `${date}|${brand}`;
      if (!byBrand[bk]) byBrand[bk] = { date, brand, revenue: 0, purchaseCost: 0, quantity: 0 };
      byBrand[bk].revenue      += rev;
      byBrand[bk].purchaseCost += cost * qty;
      byBrand[bk].quantity     += qty;
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

    // Cross-sell
    const names = productItems.map(i => (i.name || '').trim()).filter(Boolean);
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const [pA, pB] = [names[a], names[b]].sort();
        const ck = `${pA}|||${pB}`;
        crossSellMap[ck] = (crossSellMap[ck] || 0) + 1;
      }
    }

    // Retention
    const custKey = order.customerGuid || order.email || 'unknown';
    if (!retentionMap[custKey]) retentionMap[custKey] = { dates: [], revenues: [], revsVat: [] };
    const ret = retentionMap[custKey];
    ret.dates.push(date);
    const shippingItem = items.find(i => i.itemType === 'shipping');
    ret.revenues.push(parseNum(order.price?.withoutVat) - (shippingItem ? parseNum(shippingItem.itemPrice?.withoutVat) : 0));
    ret.revsVat.push(parseNum(order.price?.withVat) - (shippingItem ? parseNum(shippingItem.itemPrice?.withVat) : 0));

    // Order value
    orderValues.push({ date, value: orderRevenue });

    // Shipping & payment
    const shippingName  = order.shipping?.name || 'Neznámo';
    const paymentName   = order.paymentMethod?.name || 'Neznámo';
    const shippingRevVat = parseNum(shippingItem?.itemPrice?.withVat);

    const sk = `${date}|shipping|${shippingName}`;
    if (!shippingPayMap[sk]) shippingPayMap[sk] = { date, type: 'shipping', name: shippingName, count: 0, revenue_vat: 0 };
    shippingPayMap[sk].count++;
    shippingPayMap[sk].revenue_vat += shippingRevVat;

    const pk2 = `${date}|payment|${paymentName}`;
    if (!shippingPayMap[pk2]) shippingPayMap[pk2] = { date, type: 'payment', name: paymentName, count: 0, revenue_vat: 0 };
    shippingPayMap[pk2].count++;
  }

  // Hourly dayCount
  const dowDates = {};
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
      dayOfWeek:    cell.dayOfWeek,
      hour:         cell.hour,
      dayCount,
      totalRevenue: cell.totalRevenue,
      totalOrders:  cell.totalOrders,
      avgRevenue:   cell.totalRevenue / dayCount,
      avgOrders:    cell.totalOrders  / dayCount,
    };
  });

  const crossSellPairs = Object.entries(crossSellMap)
    .map(([key, count]) => {
      const [productA, productB] = key.split('|||');
      return { productA, productB, count, pct: totalOrders > 0 ? count / totalOrders * 100 : 0 };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  return {
    byDay,
    products:        Object.values(byProduct),
    categoryData:    Object.values(byCategory),
    brandData:       Object.values(byBrand),
    marginByDay:     Object.values(byMarginDay),
    hourlyData,
    crossSell:       { totalOrders, multiItemOrders, pairs: crossSellPairs },
    retention:       Object.values(retentionMap),
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
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: orders in CZK (cancelled excluded)

export interface RealDailyRecord {
  date: string;
  country?: 'cz';
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

export const realDataCZ: RealDailyRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'realDataCZ.ts'), content, 'utf8');
  log(`realDataCZ.ts: ${records.length} days`);
}

function writeProductData(products) {
  const records = sortByDate(products);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: product sales (cancelled excluded)

export interface ProductSaleRecord {
  date: string;
  name: string;
  amount: number;
  revenue_vat: number;
  revenue: number;
}

export const productDataCZ: ProductSaleRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'productDataCZ.ts'), content, 'utf8');
  log(`productDataCZ.ts: ${records.length} records`);
}

function writeMarginData(marginByDay) {
  const records = sortByDate(marginByDay);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: daily margin data (CZK). purchaseCost = nákupní cena, revenue = tržby bez DPH.

export interface MarginDailyRecord {
  date: string;
  purchaseCost: number;
  revenue: number;
}

export const marginDataCZ: MarginDailyRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'marginDataCZ.ts'), content, 'utf8');
  log(`marginDataCZ.ts: ${records.length} days`);
}

function writeHourlyData(hourlyData) {
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: hourly purchase behaviour (CZK), all-time

export interface HourlyPoint {
  dayOfWeek:    number;
  hour:         number;
  dayCount:     number;
  totalRevenue: number;
  totalOrders:  number;
  avgRevenue:   number;
  avgOrders:    number;
}

export const hourlyDataCZ: HourlyPoint[] = ${JSON.stringify(hourlyData, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'hourlyDataCZ.ts'), content, 'utf8');
  log(`hourlyDataCZ.ts: ${hourlyData.length} cells`);
}

function writeCrossSellData(crossSell) {
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: product pair co-occurrence from orders

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

export const crossSellDataCZ: CrossSellData = ${JSON.stringify(crossSell, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'crossSellDataCZ.ts'), content, 'utf8');
  log(`crossSellDataCZ.ts: ${crossSell.pairs.length} pairs`);
}

function writeRetentionData(retention) {
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: per-customer retention data (CZK)

export const retentionDataCZ: { dates: string[]; revenues: number[]; revsVat: number[] }[] = ${JSON.stringify(retention, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'retentionDataCZ.ts'), content, 'utf8');
  log(`retentionDataCZ.ts: ${retention.length} customers`);
}

function writeOrderValueData(orderValues) {
  const records = sortByDate(orderValues);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: per-order product basket value bez DPH (CZK), cancelled excluded

export interface OrderValueRecord {
  date: string;
  value: number;
}

export const orderValueDataCZ: OrderValueRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'orderValueDataCZ.ts'), content, 'utf8');
  log(`orderValueDataCZ.ts: ${records.length} orders`);
}

function writeCategoryData(categoryData) {
  const records = sortByDate(categoryData);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: daily revenue by category (CZK, cancelled excluded)

export interface CategoryRevenueRecord {
  date: string;
  category: string;
  subCategory: string;
  revenue: number;
  purchaseCost: number;
  quantity: number;
}

export const categoryDataCZ: CategoryRevenueRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'categoryDataCZ.ts'), content, 'utf8');
  log(`categoryDataCZ.ts: ${records.length} records`);
}

function writeBrandData(brandData) {
  const records = sortByDate(brandData);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: daily revenue by brand/manufacturer (CZK, cancelled excluded)

export interface BrandRevenueRecord {
  date: string;
  brand: string;
  revenue: number;
  purchaseCost: number;
  quantity: number;
}

export const brandDataCZ: BrandRevenueRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'brandDataCZ.ts'), content, 'utf8');
  log(`brandDataCZ.ts: ${records.length} records`);
}

function writeShippingPaymentData(shippingPayment) {
  const records = sortByDate(shippingPayment);
  const content = `// Auto-generated by scripts/fetchShoptetDataCZ.js — last update: ${now}
// CZ: shipping and payment methods per day (CZK, cancelled excluded)

export interface ShippingPaymentRecord {
  date: string;
  type: 'shipping' | 'payment';
  name: string;
  count: number;
  revenue_vat: number;
}

export const shippingPaymentDataCZ: ShippingPaymentRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, 'shippingPaymentDataCZ.ts'), content, 'utf8');
  log(`shippingPaymentDataCZ.ts: ${records.length} records`);
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
  log(`=== fetchShoptetDataCZ.js START (${FULL_SYNC ? 'FULL SYNC' : 'INCREMENTAL'}) ===`);

  const cache = loadCache();
  const SAVE_EVERY = 1500;
  let codesToFetch;

  if (FULL_SYNC || !fs.existsSync(CACHE_FILE)) {
    const fullSyncFrom = new Date('2025-01-01');
    log(`Fetching ALL order codes (full sync from ${fullSyncFrom.toISOString().substring(0, 10)})...`);
    const allCodes = await fetchOrderCodes(fullSyncFrom);
    log(`Total orders found: ${allCodes.length}`);
    // Skip codes already in cache (resume support)
    codesToFetch = allCodes.filter(code => !cache[code]);
    if (codesToFetch.length < allCodes.length) {
      log(`Resuming: ${allCodes.length - codesToFetch.length} already cached, fetching ${codesToFetch.length} remaining.`);
    }
  } else {
    const fromDate = new Date(Date.now() - INCREMENTAL_DAYS * 24 * 60 * 60 * 1000);
    log(`Fetching orders changed since ${fromDate.toISOString()}...`);
    codesToFetch = await fetchOrderCodes(fromDate);
    log(`Orders to update: ${codesToFetch.length}`);
  }

  log(`Fetching ${codesToFetch.length} order details (batch size: ${BATCH_SIZE})...`);
  let updated = 0;
  for (let i = 0; i < codesToFetch.length; i += BATCH_SIZE) {
    const batch = codesToFetch.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (code) => {
      try { return await fetchOrderDetail(code); }
      catch (e) { log(`WARNING: Failed to fetch order ${code}: ${e.message}`); return null; }
    }));
    for (const order of results) {
      if (order) { cache[order.code] = order; updated++; }
    }
    const done = Math.min(i + BATCH_SIZE, codesToFetch.length);
    if (done % SAVE_EVERY === 0 || done >= codesToFetch.length) {
      log(`Order details: ${done} / ${codesToFetch.length}`);
      saveCache(cache);
    }
    if (i + BATCH_SIZE < codesToFetch.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  log(`Updated ${updated} orders in cache. Total cached: ${Object.keys(cache).length}`);

  const productCategoryMap = await buildProductCategoryMap();

  const allOrders = Object.values(cache);
  log(`Processing ${allOrders.length} orders...`);
  const aggregated = processOrders(allOrders, productCategoryMap);

  writeRealData(aggregated.byDay);
  writeProductData(aggregated.products);
  writeCategoryData(aggregated.categoryData);
  writeBrandData(aggregated.brandData);
  writeMarginData(aggregated.marginByDay);
  writeHourlyData(aggregated.hourlyData);
  writeCrossSellData(aggregated.crossSell);
  writeRetentionData(aggregated.retention);
  writeOrderValueData(aggregated.orderValues);
  writeShippingPaymentData(aggregated.shippingPayment);
  writeLastUpdate();

  log('=== fetchShoptetDataCZ.js DONE ===');
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
