# CLAUDE.md

Tento soubor slouží jako stručný návod pro Claude Code (claude.ai/code) při práci s tímto repozitářem.

## Příkazy

```bash
npm install      # Nainstaluje závislosti
npm run dev      # Spustí dev server (Next.js, hot reload)
npm run build    # Produkční build — často odhalí TS chyby
npm run start    # Spustí produkční build

node --env-file=.env.local scripts/migrate.js      # Vytvoří tabulku users v Neon DB
node --env-file=.env.local scripts/seedAdmin.js [email] [jméno] [heslo]  # Vytvoří admin uživatele

node scripts/updateData.js              # Ruční refresh CZ+SK dat z Google Sheets

node scripts/updateAllMarkets.js        # Spustí všechny Shoptet syncy + Google Sheets + git push

node scripts/fetchShoptetData.js              # Inkrementální sync AT (posledních 10 dní)
node scripts/fetchShoptetData.js --full       # Full sync AT
node scripts/fetchShoptetDataPL.js            # Inkrementální sync PL
node scripts/fetchShoptetDataPL.js --full
node scripts/fetchShoptetDataNL.js            # Inkrementální sync NL
node scripts/fetchShoptetDataNL.js --full
node scripts/fetchShoptetDataDE.js            # Inkrementální sync DE
node scripts/fetchShoptetDataDE.js --full
node scripts/fetchShoptetDataSK.js            # Inkrementální sync SK
node scripts/fetchShoptetDataSK.js --full
node scripts/fetchShoptetDataCZ.js            # Inkrementální sync CZ
node scripts/fetchShoptetDataCZ.js --full     # Full sync CZ (od 2023-01-01)

node scripts/generateCategoryCrossSell.js     # Vygeneruje categoryCrossSellData{XX}.ts pro všechny trhy z order cache
```

V projektu nejsou nakonfigurované linter ani testy.

## Architektura

Next.js (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, NextAuth 5, Radix UI, PostgreSQL (Neon).

### Tok dat

```
Google Sheets (CSV)
       ↓  scripts/updateData.js
data/realDataCZ.ts + realDataSK.ts + productData* + marginData* + hourlyData* +
crossSellData* + retentionData* + orderValueData* + shippingPaymentData* + lastUpdate.ts

Shoptet Private API
       ↓  scripts/fetchShoptetData.js    (AT — SHOPTET_API_TOKEN_AT)
       ↓  scripts/fetchShoptetDataPL.js  (PL — SHOPTET_API_TOKEN_PL)
       ↓  scripts/fetchShoptetDataNL.js  (NL — SHOPTET_API_TOKEN_NL)
       ↓  scripts/fetchShoptetDataDE.js  (DE — SHOPTET_API_TOKEN_DE)
       ↓  scripts/fetchShoptetDataSK.js  (SK — SHOPTET_API_TOKEN_SK)
       ↓  scripts/fetchShoptetDataCZ.js  (CZ — SHOPTET_API_TOKEN_CZ)
data/realData*.ts + productData* + marginData* + hourlyData* + crossSellData* +
retentionData* + orderValueData* + shippingPaymentData* + categoryData* + brandData*
       ↓
data/mockGenerator.ts  →  export const mockData: DailyRecord[]  (AT)
       ↓
hooks/useDashboardData.ts  (filters + aggregates → KpiData, chartData, YoY)
       ↓
app/(dashboard|orders|marketing|products|margin|analytics|behavior|crosssell|retention|shipping|categories|brands)/page.tsx
```

### Aktualizace dat

- **GitHub Actions** (`.github/workflows/update-data.yml`) — spouští `scripts/updateAllMarkets.js` každý den v **04:00 CET** (03:00 UTC)
- `updateAllMarkets.js` spustí sekvenčně AT → PL → NL → DE → SK → CZ (inkrementální 10 dní) → updateData.js (Google Sheets), pak `git commit + push` → Vercel redeploy
- `data/lastUpdate.ts` — auto-gen timestamp poslední aktualizace, zobrazen v TopBaru vpravo
- **CZ full sync** — `fetchShoptetDataCZ.js --full` stáhne ~95k objednávek od 2023-01-01 (resumable, trvá ~14 h); po dokončení commitnout `data/*CZ.ts`

### Databáze (Neon PostgreSQL)

- Připojení přes env proměnnou `DATABASE_URL` (Neon serverless PostgreSQL, Frankfurt)
- `lib/db.ts` — singleton `Pool` (pg)
- `lib/users.ts` — CRUD pro uživatele čte/zapisuje do DB (tabulka `users`)
- `lib/schema.sql` + `scripts/migrate.js` — schéma + migrace
- `scripts/seedAdmin.js` — vytvoří prvního admin uživatele

### Stránky

| Stránka | Popis |
|---------|-------|
| `/hlavni-dashboard` | **Hlavní Dashboard** — měsíční přehled 8 KPI metrik jako grouped bar charty. Výchozí přesměrování z `/`. |
| `/dashboard` | **Klíčové ukazatele (KPI)** — Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na obj. + samostatný řádek Hrubý zisk + Hrubý zisk %. Pod KPI boxy: 4 spojnicové grafy YoY. |
| `/orders` | Objednávky — tržby vs počet, distribuce hodnot košíku (histogram) |
| `/marketing` | Marketingové investice — CPC per channel (FB/Google), trend kliky+CPC |
| `/products` | Prodejnost produktů — ABC analýza, sortovatelná tabulka, YoY, CSV export, graf vývoje tržeb+kusů |
| `/margin` | Maržový report — marže %, hrubý zisk, grafy |
| `/analytics` | GA4 integrace — sessions, CVR, sources+devices (YoY), vstupní stránky |
| `/meta` | Meta Ads — KPI boxy s YoY, grafy po dnech, tabulka kreativ s filtrem |
| `/behavior` | Nákupní chování — týdenní srovnání, hourly grid (all-time agregace) |
| `/crosssell` | Cross-sell potenciál — top 100 produktových párů + 2 tabulky kategoriového cross-sellu (1. a 2. řád) |
| `/retention` | Retenční analýza — RFM segmentace, LTV, AOV, repeat purchase rate, měsíční graf Noví vs. stávající |
| `/shipping` | Doprava a platby — KPI vč. zisku/ztráty dopravy, ceník dopravců, P&L tabulka per dopravce |
| `/categories` | Kategorie prodejnost — tržby bez DPH dle kategorií, trendový graf, YoY tabulka + sloupec Počet ks s YoY; podporuje selektor Vše (agregace 6 trhů v CZK, překlady do češtiny) |
| `/brands` | Značky — tržby bez DPH dle značek/výrobců, trendový graf, YoY tabulka + sloupec Počet ks s YoY; podporuje selektor Vše (agregace 6 trhů v CZK) |
| `/login` | Přihlášení (NextAuth) |
| `/admin/users` | Správa uživatelů (admin only) |

### Práce s měnami

- **CZ** — CZK, **SK** — EUR, **AT/NL/DE** — EUR, **PL** — PLN
- `getDisplayCurrency(countries)` v `data/types.ts`:
  - Solo PL → `'PLN'`
  - Solo CZ → `'CZK'`
  - Více zemí (Vše) → `'CZK'` (agregace přes kurzy)
  - Ostatní (AT/SK/NL/DE) → `'EUR'`
- `formatCurrency(v, currency)` v `lib/formatters.ts` podporuje `'CZK' | 'EUR' | 'PLN'`
- `Country = 'at' | 'cz' | 'sk' | 'pl' | 'nl' | 'de'`
- `ALL_COUNTRIES: Country[]` a `isAllCountries(countries)` exportovány z `data/types.ts`

### Multi-country „Vše" selektor

TopBar obsahuje tlačítko **Vše** (první) + individuální tlačítka zemí (single-select). Při výběru Vše:
- `filters.countries = ALL_COUNTRIES` (všech 6 zemí)
- `getDisplayCurrency` vrací `'CZK'`
- Všechny hodnoty jsou přepočítány aktuálním kurzem do Kč (viz `useExchangeRates`)
- Stránky s podporou Vše: `/hlavni-dashboard`, `/dashboard`, `/orders`, `/margin`, `/categories`, `/brands`
- Na `/categories` a `/brands` se při Vše agregují data ze všech 6 trhů s převodem do CZK (`toCZK`) + překlady kategorií/subkategorií do češtiny (`lib/categoryTranslations.ts`)
- Na `/categories` se překlady aplikují i pro jednotlivé země (ne jen Vše) — kategorie jsou vždy v češtině
- Tlačítko **Vše skryto** na: `/shipping`, `/retention`, `/analytics`, `/crosssell`, `/behavior`

### Kurzy měn (`useExchangeRates`)

- `hooks/useExchangeRates.ts` — hook fetchující kurzy, cache v `localStorage` 24 h, fallback EUR=25, PLN=5,85
- `app/api/exchange-rates/route.ts` — Next.js API route, data z frankfurter.app (ECB), `revalidate: 86400`
- `toCZK(value, currency, rates)` — utility pro převod EUR/PLN→CZK
- `useDashboardData(filters, allData, rates?)` — volitelný `rates` param; při multi-country konvertuje záznamy přes `convertRecord()`

### Klíčové soubory

| Soubor | Účel |
|--------|------|
| `data/types.ts` | `DailyRecord`, `KpiData`, `FilterState`, `Country`, `Currency`, `getDisplayCurrency` |
| `data/mockGenerator.ts` | AT data → `mockData: DailyRecord[]`, `getDailyMarketingData()`, `getMarketingSourceData()` |
| `data/realDataCZ.ts` | Auto-gen CZ data (CZK) z Shoptet API — **needitovat ručně** |
| `data/realDataSK.ts` | Auto-gen SK data (EUR) z Shoptet API — **needitovat ručně** |
| `data/realDataAT.ts` | Auto-gen AT data (EUR) z Shoptet API — **needitovat ručně** |
| `data/realDataPL.ts` | Auto-gen PL data (PLN) z Shoptet API — **needitovat ručně** |
| `data/realDataNL.ts` | Auto-gen NL data (EUR) z Shoptet API — **needitovat ručně** |
| `data/realDataDE.ts` | Auto-gen DE data (EUR) z Shoptet API — **needitovat ručně** |
| `data/lastUpdate.ts` | Auto-gen timestamp poslední aktualizace — **needitovat ručně** |
| `data/categoryData*.ts` | Tržby + počet kusů dle kategorií — auto-gen ze Shoptet API (AT/PL/NL/DE/SK/CZ); pole `quantity: number` |
| `data/brandData*.ts` | Tržby + počet kusů dle značek — auto-gen ze Shoptet API (AT/PL/NL/DE/SK/CZ); pole `quantity: number` |
| `data/productData*.ts` | Prodej produktů (počet kusů, tržby) — auto-gen |
| `data/marginData*.ts` | Marže (nákupní cena vs tržby bez DPH) — auto-gen |
| `data/hourlyData*.ts` | Nákupní chování 7×24 grid — auto-gen, all-time |
| `data/crossSellData*.ts` | Top 100 produktových párů — auto-gen |
| `data/retentionData*.ts` | Per-customer retence `{ dates, revenues, revsVat }[]` — auto-gen |
| `data/orderValueData*.ts` | Per-order košík bez DPH `{ date, value }[]` — auto-gen |
| `data/shippingPaymentData*.ts` | Doprava+platby po dnech — auto-gen |
| `data/categoryCrossSellData*.ts` | Kategoriový cross-sell (root páry + subkategorie páry) — gen přes `generateCategoryCrossSell.js` |
| `lib/categoryTranslations.ts` | Překlady kategorií z DE/PL/NL/SK do češtiny (`translateCategory`, `translateSubCategory`) |
| `lib/db.ts` | Neon PostgreSQL pool (singleton) |
| `lib/users.ts` | CRUD uživatelů přes Neon DB (getUsers, getUserByEmail, addUser, deleteUser, updatePassword) |
| `lib/schema.sql` | Schéma tabulky `users` |
| `lib/retentionUtils.ts` | Výpočty pro `/retention` (KPI, YoY, RFM, měsíční Noví vs. stávající) |
| `lib/formatters.ts` | `formatCurrency` (CZK/EUR/PLN), `formatPercent`, `formatNumber`, `localIsoDate` |
| `hooks/useFilters.ts` | `FiltersProvider` + `useFilters()` + `getDateRange()` |
| `hooks/useDashboardData.ts` | Filtruje, agreguje, normalizuje měny, počítá KPI + chartData + YoY; volitelný param `rates` pro multi-country CZK konverzi |
| `hooks/useExchangeRates.ts` | Kurzy EUR_CZK + PLN_CZK z frankfurter.app; localStorage cache 24 h; `toCZK()` utility |
| `hooks/useHlavniDashboard.tsx` | Context pro Hlavní Dashboard — market, yearA, yearB, yearOptions |
| `scripts/updateAllMarkets.js` | Master update skript — spustí všechny Shoptet syncy + Google Sheets + git push |
| `scripts/updateData.js` | Google Sheets sync (CZ+SK costs, margins) + git push |
| `scripts/fetchShoptetData.js` | AT Shoptet sync (inkrementální 10 dní / full) |
| `scripts/fetchShoptetDataCZ.js` | CZ Shoptet sync — resumable full sync od 2023-01-01, průběžné ukládání cache |
| `app/api/update/route.ts` | POST endpoint — admin only; Vercel Deploy Hook nebo lokální skript |
| `app/api/exchange-rates/route.ts` | GET endpoint — vrací aktuální kurzy EUR_CZK + PLN_CZK (frankfurter.app, revalidate 24 h) |
| `components/tables/DailyTable.tsx` | Tabulka „Přehled po dnech"; prop `currency?: Currency` (default `'EUR'`) — předávat vždy z page |
| `components/tables/CountryDistribution.tsx` | Tabulka distribuce dle zemí (multi-country view); hodnoty vždy v CZK; YoY badges + sloupce AOV, Marže %, Hrubý zisk, Hrubý zisk %; názvy zemí v češtině |
| `components/layout/TopBar.tsx` | Selektor zemí: tlačítko **Vše** (první) + single-select jednotlivé země; rok-selector pro `/hlavni-dashboard` |

### KPI komponenty

Dva typy KPI karet — **neměnit vzájemně**:
- **`StatCard`** — používají `/margin`, `/retention`, `/crosssell`. Prop `negative` = rose border/barva.
- **`KpiCard`** — používají `/dashboard`, `/orders`, `/marketing`, `/products`, `/shipping`. Podporuje sparkline, YoY badge a `variant: 'default' | 'green' | 'red'`.

### `localIsoDate(d: Date)`

Funkce v `lib/formatters.ts` — vrací datum jako `"YYYY-MM-DD"` v **lokálním čase**. Používat všude místo `.toISOString().split('T')[0]`, jinak v CEST (UTC+2) dochází k posunutí data o den zpět.

### fetchShoptetDataCZ.js — resumable full sync

CZ full sync stahuje ~95k objednávek (od 2023-01-01), trvá cca 14 hodin. Klíčové vlastnosti:
- **Resume** — při pádu přeskočí objednávky již uložené v `scripts/orders_cache_cz.json`
- **Průběžné ukládání** — cache se ukládá každých 1 500 objednávek
- **Velká cache** — ukládá se streamingem přes `fs.writeSync` (nikoliv `JSON.stringify`), protože ~95k detailních objednávek přesahuje limit délky stringu v Node.js
- **Atomický zápis** — cache se zapisuje do `.tmp` souboru a pak přejmenuje (`fs.renameSync`), aby nedošlo ke korupci při pádu procesu uprostřed zápisu

### `/dashboard` — Klíčové ukazatele (KPI)

KPI boxy (11 + 2 ve vlastním řádku): Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na objednávku + Hrubý zisk, Hrubý zisk %.

Marže a Hrubý zisk:
- `margin = marginRev - purchaseCost`
- `marginPct = margin / marginRev × 100`
- `grossProfit = margin - kpi.cost`
- `grossPct = grossProfit / marginRev × 100`

### `/retention` — Retenční analýza

- **Měsíční graf Noví vs. stávající zákazníci** — 100% stacked bar (zelená = noví, modrá = stávající)
- Data z `computeMonthlyNewVsReturning()` v `lib/retentionUtils.ts`

### `/shipping` — Doprava a platby

**Ceník dopravců** — editovatelná tabulka uložená v `localStorage` (`carrierCosts_v1`).
**Tabulka Zisk/ztráta per dopravce** — zobrazí se pouze pokud je vyplněn ceník.

### ABC analýza produktů (`/products`)

- **A** — top produkty → 0–80 % tržeb (zelené)
- **B** — střední produkty → 80–95 % tržeb (žluté)
- **C** — slabé produkty → 95–100 % tržeb (červené)
