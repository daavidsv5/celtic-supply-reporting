// Generates categoryCrossSellData{XX}.ts for all markets from existing order caches.
// Run: node scripts/generateCategoryCrossSell.js

const fs   = require('fs');
const path = require('path');
const v8   = require('v8');

const SCRIPTS_DIR = __dirname;
const DATA_DIR    = path.join(__dirname, '..', 'data');

const CANCELLED = new Set([-4]);

// Category names to exclude from pairs (hidden / uncategorised)
const HIDDEN_CATS = new Set([
  'Nezařazeno', 'Nach Hersteller', 'Skrýt',
  'Nezaradené', 'Podľa výrobcu', 'Nicht kategorisiert',
]);

const MARKETS = [
  { key: 'at', label: 'AT', cacheFile: 'orders_cache_at.json', catMapFile: 'category_map_at.json', exportName: 'categoryCrossSellDataAT', outFile: 'categoryCrossSellDataAT.ts', v8Cache: false },
  { key: 'cz', label: 'CZ', cacheFile: 'orders_cache_cz.json', catMapFile: 'category_map_cz.json', exportName: 'categoryCrossSellDataCZ', outFile: 'categoryCrossSellDataCZ.ts', v8Cache: true  },
  { key: 'sk', label: 'SK', cacheFile: 'orders_cache_sk.json', catMapFile: 'category_map_sk.json', exportName: 'categoryCrossSellDataSK', outFile: 'categoryCrossSellDataSK.ts', v8Cache: false },
  { key: 'pl', label: 'PL', cacheFile: 'orders_cache_pl.json', catMapFile: 'category_map_pl.json', exportName: 'categoryCrossSellDataPL', outFile: 'categoryCrossSellDataPL.ts', v8Cache: false },
  { key: 'nl', label: 'NL', cacheFile: 'orders_cache_nl.json', catMapFile: 'category_map_nl.json', exportName: 'categoryCrossSellDataNL', outFile: 'categoryCrossSellDataNL.ts', v8Cache: false },
  { key: 'de', label: 'DE', cacheFile: 'orders_cache_de.json', catMapFile: 'category_map_de.json', exportName: 'categoryCrossSellDataDE', outFile: 'categoryCrossSellDataDE.ts', v8Cache: false },
];

function loadOrderCache(filePath, tryV8) {
  if (!fs.existsSync(filePath)) { console.log(`  Cache not found: ${filePath}`); return {}; }
  const buf = fs.readFileSync(filePath);
  if (tryV8) { try { return v8.deserialize(buf); } catch {} }
  try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
}

function processMarket(market) {
  const cacheFile  = path.join(SCRIPTS_DIR, market.cacheFile);
  const catMapFile = path.join(SCRIPTS_DIR, market.catMapFile);

  console.log(`\n[${market.label}] Loading order cache...`);
  const cache  = loadOrderCache(cacheFile, market.v8Cache);
  const orders = Object.values(cache);
  console.log(`[${market.label}] ${orders.length} orders in cache`);

  const productCategoryMap = fs.existsSync(catMapFile)
    ? JSON.parse(fs.readFileSync(catMapFile, 'utf8'))
    : {};

  const catMap    = {}; // root pair → count
  const subCatMap = {}; // subcategory pair → count
  let totalOrders = 0;
  let multiItemOrders = 0;

  for (const order of orders) {
    if (!order?.status || CANCELLED.has(order.status.id)) continue;
    const productItems = (order.items || []).filter(i => i.itemType === 'product');
    if (!productItems.length) continue;

    totalOrders++;
    if (productItems.length >= 2) multiItemOrders++;

    // ── 1st-order (root category) pairs ────────────────────────────────────────
    const rootCats = [...new Set(
      productItems.map(i => {
        const entry = i.productGuid && productCategoryMap[i.productGuid];
        const root  = (entry && entry.root) || 'Nezařazeno';
        return HIDDEN_CATS.has(root) ? null : root;
      }).filter(Boolean)
    )];

    for (let a = 0; a < rootCats.length; a++) {
      for (let b = a + 1; b < rootCats.length; b++) {
        const [cA, cB] = [rootCats[a], rootCats[b]].sort();
        const ck = `${cA}|||${cB}`;
        catMap[ck] = (catMap[ck] || 0) + 1;
      }
    }

    // ── 2nd-order (subcategory) pairs — only items with an actual subcategory ──
    const subCats = [...new Set(
      productItems.map(i => {
        const entry = i.productGuid && productCategoryMap[i.productGuid];
        if (!entry) return null;
        const root = entry.root || 'Nezařazeno';
        if (HIDDEN_CATS.has(root)) return null;
        const sub = entry.sub || '';
        if (!sub) return null; // skip items without subcategory
        return `${root} › ${sub}`;
      }).filter(Boolean)
    )];

    for (let a = 0; a < subCats.length; a++) {
      for (let b = a + 1; b < subCats.length; b++) {
        const [cA, cB] = [subCats[a], subCats[b]].sort();
        const ck = `${cA}|||${cB}`;
        subCatMap[ck] = (subCatMap[ck] || 0) + 1;
      }
    }
  }

  const toPairs = (map, limit) =>
    Object.entries(map)
      .map(([key, count]) => {
        const [catA, catB] = key.split('|||');
        return { catA, catB, count, pct: totalOrders > 0 ? parseFloat((count / totalOrders * 100).toFixed(2)) : 0 };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  const catPairs    = toPairs(catMap, 50);
  const subCatPairs = toPairs(subCatMap, 100);

  console.log(`[${market.label}] Root pairs: ${catPairs.length}, Sub pairs: ${subCatPairs.length}, Orders: ${totalOrders}`);
  return { totalOrders, multiItemOrders, catPairs, subCatPairs };
}

function writeFile(market, data) {
  const today = new Date().toISOString().substring(0, 10);
  const content = `// Auto-generated by scripts/generateCategoryCrossSell.js — last update: ${today}
// ${market.label}: category pair co-occurrence from orders

export interface CategoryCrossSellPair {
  catA: string;
  catB: string;
  count: number;
  pct: number;
}

export interface CategoryCrossSellData {
  totalOrders: number;
  multiItemOrders: number;
  catPairs: CategoryCrossSellPair[];
  subCatPairs: CategoryCrossSellPair[];
}

export const ${market.exportName}: CategoryCrossSellData = ${JSON.stringify(data, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, market.outFile), content, 'utf8');
  console.log(`[${market.label}] Written: ${market.outFile}`);
}

(async () => {
  for (const market of MARKETS) {
    try {
      const data = processMarket(market);
      writeFile(market, data);
    } catch (e) {
      console.error(`[${market.label}] ERROR:`, e.message);
    }
  }
  console.log('\n=== generateCategoryCrossSell.js DONE ===');
})();
