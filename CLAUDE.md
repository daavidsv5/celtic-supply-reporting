# CLAUDE.md

Tento soubor slouží jako stručný návod pro Claude Code (claude.ai/code) při práci s tímto repozitářem.

## Příkazy

```bash
npm install      # Nainstaluje závislosti
npm run dev      # Spustí dev server (Next.js, hot reload)
npm run build    # Produkční build — často odhalí TS chyby
npm run start    # Spustí produkční build

node scripts/updateData.js   # Ruční refresh reálných dat z Google Sheets
```

V projektu nejsou nakonfigurované linter ani testy.

## Architektura

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, NextAuth 5, Radix UI.

### Tok dat

```
Google Sheets (CSV)
       ↓  scripts/updateData.js  (denně v 05:00 via Windows Task Scheduler)
       ↓  na konci skriptu: git commit + push → Vercel automaticky redeploy
data/realDataCZ.ts + realDataSK.ts + productData* + marginData* + hourlyData* +
crossSellData* + retentionData* + orderValueData* + shippingPaymentData* + lastUpdate.ts
       ↓
data/mockGenerator.ts  →  export const mockData: DailyRecord[]
                       →  getDailyMarketingData() + getMarketingSourceData()
       ↓
hooks/useDashboardData.ts  (filters + aggregates → KpiData, chartData, YoY)
       ↓
app/(dashboard|orders|marketing|products|margin|analytics|behavior|crosssell|retention|shipping)/page.tsx
```

### Aktualizace dat na Vercelu

- `scripts/updateData.js` běží lokálně denně v 05:00 (Windows Task Scheduler)
- Na konci skriptu se provede `git commit + push` → Vercel automaticky nasadí nová data
- Tlačítko **Aktualizovat data** (viditelné pouze adminům) volá `/api/update`:
  - Na Vercelu: spustí Vercel Deploy Hook (`VERCEL_DEPLOY_HOOK_URL` env proměnná)
  - Lokálně: spustí `node updateData.js` přímo
- `data/lastUpdate.ts` — auto-gen timestamp poslední aktualizace, zobrazen v TopBaru vpravo

### Stránky

| Stránka | Popis |
|---------|-------|
| `/dashboard` | **Klíčové ukazatele (KPI)** — Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na obj. + samostatný řádek Hrubý zisk + Hrubý zisk % |
| `/orders` | Objednávky — tržby vs počet, distribuce hodnot košíku (histogram), rozložení CZ/SK |
| `/marketing` | Marketingové investice — CPC per channel (FB/Google), trend kliky+CPC (ROAS odstraněn) |
| `/products` | Prodejnost produktů — ABC analýza (A/B/C segmenty), sortovatelná tabulka, YoY, CSV export |
| `/margin` | Maržový report — marže %, hrubý zisk, grafy |
| `/analytics` | GA4 integrace — sessions, CVR, sources+devices (YoY), vstupní stránky; zatím jen CZ |
| `/behavior` | Nákupní chování — týdenní srovnání, hourly grid (all-time agregace) |
| `/crosssell` | Cross-sell potenciál — top 100 produktových párů |
| `/retention` | Retenční analýza — RFM segmentace, LTV, AOV, repeat purchase rate, měsíční graf Noví vs. stávající zákazníci (100% stacked bar) |
| `/shipping` | Doprava a platby — KPI vč. zisku/ztráty dopravy, ceník dopravců (CZ/SK), P&L tabulka per dopravce |
| `/login` | Přihlášení (NextAuth) |
| `/admin/users` | Správa uživatelů (admin only) |

### Práce s měnami

- CZ data jsou v **CZK**. SK data jsou v **EUR**.
- `getDisplayCurrency(countries)` v `data/types.ts`: vrací `'EUR'` pouze tehdy, když je vybrané jen SK; jinak `'CZK'`.
- Při kombinaci CZ+SK se SK hodnoty násobí `eurToCzk` (live rate z frankfurter.app, fallback `EUR_TO_CZK = 25`) uvnitř `useDashboardData` a `getMarketingSourceData` před agregací.
- Všechny money formattery berou `currency: 'CZK' | 'EUR'`.

### Meziroční srovnání (YoY)

- **CZ nemá YoY** — e-shop běží od května 2025. `hasPrevData` bude `false` kdykoliv je ve filtru CZ a nejsou dostupné záznamy z předchozího roku.
- **SK má YoY** — reálná data od března 2024; mock SK data (seeded RNG) doplňují leden–únor 2024 jako základ pro YoY.
- `hasPrevData` předávej do `KpiCard`, `RevenueOrdersChart` a `CostPnoChart`, aby šlo podmíněně skrýt YoY badge a "minulý rok" řady v grafech.

### Klíčové soubory

| Soubor | Účel |
|--------|------|
| `data/types.ts` | `DailyRecord`, `KpiData`, `FilterState`, `TimePeriod`, `EUR_TO_CZK`, `getDisplayCurrency` |
| `data/mockGenerator.ts` | Kombinuje reálná + mock data; `getDailyMarketingData()` + `getMarketingSourceData()` |
| `data/realDataCZ.ts` | Auto-gen reálná CZ data (CZK) — **needitovat ručně** |
| `data/realDataSK.ts` | Auto-gen reálná SK data (EUR) — **needitovat ručně** |
| `data/lastUpdate.ts` | Auto-gen timestamp poslední aktualizace dat — **needitovat ručně** |
| `data/productDataCZ.ts` / `productDataSK.ts` | Prodej produktů (počet kusů, tržby) — auto-gen |
| `data/marginDataCZ.ts` / `marginDataSK.ts` | Marže (nákupní cena vs tržby bez DPH) — auto-gen |
| `data/hourlyDataCZ.ts` / `hourlyDataSK.ts` | Nákupní chování 7×24 grid — auto-gen, all-time |
| `data/crossSellDataCZ.ts` / `crossSellDataSK.ts` | Top 100 produktových párů — auto-gen |
| `data/retentionDataCZ.ts` / `retentionDataSK.ts` | Per-customer retence `{ dates, revenues, revsVat }[]` — auto-gen |
| `data/orderValueDataCZ.ts` / `orderValueDataSK.ts` | Per-order košík bez DPH `{ date, value }[]` — auto-gen |
| `data/shippingPaymentDataCZ.ts` / `shippingPaymentDataSK.ts` | Doprava+platby po dnech — auto-gen |
| `lib/retentionUtils.ts` | Všechny výpočty pro `/retention` (KPI, YoY, RFM segmentace, distribuce, měsíční Noví vs. stávající) |
| `lib/formatters.ts` | `formatCurrency`, `formatPercent`, `formatNumber`, `formatDate`, `formatShortDate`, `formatMonthYear` |
| `components/kpi/StatCard.tsx` | Sdílená KPI karta (border-2 border-blue-800, icon vpravo); prop `negative` = rose varianta; props `yoy`, `hasPrevData`, `invertYoy` pro YoY badge |
| `components/kpi/KpiCard.tsx` | KPI karta se sparkline a YoY badge; prop `variant: 'default' \| 'green' \| 'red'` mění barvu rámečku, ikony a hodnoty |
| `hooks/useFilters.ts` | `FiltersProvider` + `useFilters()` + `getDateRange()` + live EUR rate |
| `hooks/useDashboardData.ts` | Filtruje, agreguje, normalizuje měny, počítá KPI + chartData + YoY |
| `scripts/updateData.js` | Čistý Node.js — stáhne CSV z Google Sheets, generuje všechny data/*.ts soubory, pak git push |
| `app/api/update/route.ts` | POST endpoint — admin only; na Vercelu volá Deploy Hook, lokálně spustí skript |

### KPI komponenty

Dva typy KPI karet — **neměnit vzájemně**:
- **`StatCard`** — používají `/margin`, `/retention`, `/crosssell`. Prop `negative` = rose border/barva. Props `yoy`, `hasPrevData`, `invertYoy` pro YoY badge.
- **`KpiCard`** — používají `/dashboard`, `/orders`, `/marketing`, `/products`, `/shipping`. Podporuje sparkline, YoY badge a `variant`:
  - `'default'` — modrý rámeček (výchozí)
  - `'green'` — tmavě zelený rámeček + zelená hodnota (Hrubý zisk)
  - `'red'` — červený rámeček + červená hodnota (ztráta dopravy)

### `/dashboard` — Klíčové ukazatele (KPI)

KPI boxy (11 + 2 ve vlastním řádku): Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na objednávku + **samostatný řádek: Hrubý zisk, Hrubý zisk %** (variant='green').

**Odstraněno:** Storna, Podíl storen (odstraněno na žádost uživatele).

Marže a Hrubý zisk se počítají z `marginDataCZ` / `marginDataSK`:
- `margin = marginRev - purchaseCost`
- `marginPct = margin / marginRev × 100`
- `grossProfit = margin - kpi.cost`
- `grossPct = grossProfit / marginRev × 100`

### `/retention` — Retenční analýza

- **Měsíční graf Noví vs. stávající zákazníci** — 100% stacked bar, hned pod KPI boxy
  - Data z `computeMonthlyNewVsReturning()` v `lib/retentionUtils.ts`
  - Zelená = noví (první nákup v daném měsíci), Modrá = stávající (vrátili se)
  - Osa X: název měsíce + rok (`formatMonthYear`), Osa Y: % podíl
  - Tooltip zobrazuje skutečné počty zákazníků
- RFM segmentace, LTV, AOV, repeat purchase rate — beze změny

### `/shipping` — Doprava a platby

**KPI boxy** (8 celkem):
- `Doprava zákazník` — příjmy od zákazníků za dopravu
- `Doprava e-shop` — náklady e-shopu dle ceníku dopravců
- `Doprava zisk / ztráta` — rozdíl; `variant='green'` nebo `'red'`; zobrazuje `'--'` pokud ceník není vyplněn

**Ceník dopravců** — editovatelná tabulka uložená v `localStorage` (`carrierCosts_v1`):
- Rozdělena na CZ (Kč) a SK (€) sekce
- Zobrazuje pouze panely odpovídající aktivním selektorům CZ/SK
- Struktura: `Record<carrierName, { cz: string, sk: string, note: string }>`

**Tabulka Zisk / ztráta per dopravce** — zobrazí se pouze pokud je vyplněn ceník:
- Sloupce: Dopravce, Obj., Zákazník platí, E-shop platí, Zisk/ztráta, Na objednávku
- Zákazník platí = z `shippingRows` (agregace za období)
- E-shop platí = `czCount[name] × costs[name].cz + skCount[name] × costs[name].sk × skMult`

### ABC analýza produktů (`/products`)

Produkty se klasifikují dle kumulativního podílu na tržbách bez DPH (seřazeno sestupně):
- **A** — top produkty → 0–80 % tržeb (zelené)
- **B** — střední produkty → 80–95 % tržeb (žluté)
- **C** — slabé produkty → 95–100 % tržeb (červené)

Klasifikace se vždy počítá ze všech dat (sort dle revenue desc), nezávisle na aktuálním řazení tabulky.

### Distribuce hodnot objednávek (`/orders`)

`orderValueData*` = per-order košík bez DPH (bez dopravy a platby), extrahovaný z col[56] Shoptet exportu.
- CZK buckety: 0–500, 500–1k, 1k–2k, 2k–5k, 5k+
- EUR buckety: 0–20, 20–40, 40–80, 80–200, 200+
- Při kombinaci CZ+SK se SK hodnoty převádí na CZK přes `eurToCzk`.
- Histogram zobrazuje peak bucket (tmavě modrý) + amber tip na dopravu zdarma.

### Marketing — CPC (`/marketing`)

Data z `getDailyMarketingData()` — každý den má `clicks_facebook`, `clicks_google`, `cost_facebook`, `cost_google`, `revenue`.
- **CPC** = cost_channel / clicks_channel (per den), zobrazeno na 2 desetinná místa
- **ROAS byl odstraněn** ze všech přehledů
- Grafy: ComposedChart (stacked bars kliky + lines CPC)
- Výkon per channel obsahuje YoY srovnání (FB, Google — náklady, kliky, CPC)

### RFM segmentace zákazníků (`/retention`)

Výpočet v `lib/retentionUtils.ts` → `computeRfmSegments()`. Referenční datum = nejnovější objednávka v datasetu.

| Segment | Podmínka (priority pořadí) |
|---------|---------------------------|
| Ztracení | R > 365 dní |
| Šampioni | F ≥ 3 AND R ≤ 90 dní |
| Věrní zákazníci | F ≥ 2 AND R ≤ 180 dní |
| Ohrožení | F ≥ 2 AND R > 180 dní |
| Noví zákazníci | F = 1 AND R ≤ 90 dní |
| Jednorázové | F = 1, ostatní |

### Definice Noví vs. Stávající zákazníci (`/retention`)

- **Noví** = zákazník, jehož úplně první nákup je v daném roce
- **Stávající** = zákazník, který měl v daném roce svůj 2.+ nákup vůbec (zahrnuje i opakované nákupy ve stejném roce)
- Jeden zákazník **může být v obou kategoriích** v jednom roce (poprvé koupil a vrátil se ve stejném roce)

### Konstanta `TODAY` (defaulty pro datum)

`hooks/useFilters.ts` používá aktuální datum dynamicky:
```ts
const TODAY = new Date();
```

Pokud řešíš funkce závislé na čase (např. "posledních 7 dní"), drž logiku dat na jednom místě (`hooks/useFilters.ts` / `getDateRange()`) a počítej s hraničními efekty časových pásem při groupingu po dnech.

### Vzorec PNO

`PNO = Marketingové investice / Tržby bez DPH × 100`

(marketingové náklady dělené tržbami bez DPH; v jmenovateli není DPH)

### Hourly data

Hourly grid na stránce `/behavior` je **all-time agregace** — nezohledňuje vybrané časové období filtrů. Jde o záměrné rozhodnutí pro zachycení dlouhodobého vzorce chování.

### SK marže

Nákupní ceny pro SK nejsou dostupné — `marginDataSK` obsahuje nuly v `costPrice`. Maržový report pro SK je nepřesný.

### GA4

GA4 je napojeno pouze pro **CZ**. SK bude řešeno samostatně v budoucnu.

**`app/api/analytics/route.ts`** — vrací:
- `daily`, `dailyPrev` — denní sessions/users/conversions/bounceRate/avgDuration
- `totals` — agregáty za aktuální + předchozí rok (dva dateRanges v jednom requestu)
- `sources`, `sourcesPrev` — zdroje návštěvnosti (source/medium, top 20)
- `devices`, `devicesPrev` — rozpad na deviceCategory
- `landingPages` — vstupní stránky (top 20)
- `funnel` — checkout trychtýř agregát: begin_checkout → add_shipping_info → add_payment_info → purchase, rozpad desktop/mobile/tablet
- `funnelTrend` — denní průchodnost košíkem; každý řádek má klíče `${step}_${device}` a `${step}_all`

**`app/analytics/page.tsx`**:
- KPI boxy: Sessions, Unikátní uživatelé, Konverze, Konverzní poměr, Bounce rate, Prům. délka — grid `grid-cols-2 sm:grid-cols-3`
- Grafy v čase: Sessions YoY, Konverzní poměr YoY, Bounce rate YoY, Délka návštěvy YoY
- Zdroje návštěvnosti (progress bary, YoY badge) + Zařízení (PieChart + YoY badge)
- **Graf CVR trychtýře v čase** (`funnelTrendPct`): zobrazuje jedinou křivku — `purchase / begin_checkout × 100 %` — jak se vyvíjí CVR celého trychtýře v čase; selektor zařízení (Vše / Desktop / Mobil / Tablet); Y-osa 0–100 %, každý bod počítán relativně k `begin_checkout_${device}` daného dne
- **Trychtýř průchodnosti košíkem** (statický): stacked bar per krok, % z 1. kroku, odpad mezi kroky, rozpad desktop/mobile/tablet

### Autentizace

NextAuth 5 (beta). Uživatelé jsou uloženi v `data/users.json` (bcrypt hesla). Admin stránka `/admin/users` vyžaduje `role: 'admin'`.

- Tlačítko **Aktualizovat data** v TopBaru je viditelné **pouze adminům** (kontrola přes `useSession`)
- Ostatní uživatelé tlačítko nevidí

### Pre-existing TS chyby

`app/shipping/page.tsx` má ~8 TS chyb (Recharts PieLabel + Tooltip typy). Jsou **pre-existující**, nezpůsobené nedávnými změnami — neřešit, pokud se nerefaktoruje shipping stránka.
