import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const client = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GA4_CLIENT_EMAIL,
    private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

function shiftYearBack(dateStr: string): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('from') ?? '30daysAgo';
  const endDate   = searchParams.get('to')   ?? 'today';
  const country   = searchParams.get('country') ?? 'cz';

  const PROPERTY_IDS: Record<string, string | undefined> = {
    cz: process.env.GA4_PROPERTY_ID,
    sk: process.env.GA4_PROPERTY_ID_SK,
    at: process.env.GA4_PROPERTY_ID_AT,
    pl: process.env.GA4_PROPERTY_ID_PL,
    nl: process.env.GA4_PROPERTY_ID_NL,
    de: process.env.GA4_PROPERTY_ID_DE,
  };
  const propertyId = PROPERTY_IDS[country];
  if (!propertyId) {
    return NextResponse.json({ error: `GA4 property ID není nakonfigurováno pro trh: ${country.toUpperCase()}` }, { status: 400 });
  }

  const prevStart = shiftYearBack(startDate);
  const prevEnd   = shiftYearBack(endDate);

  try {
    // Daily sessions + users + conversions (current period only)
    const [dailyRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    // Aggregate totals: current + previous year in one request (two dateRanges, no dimensions)
    const [aggRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        { startDate, endDate,   name: 'current'  },
        { startDate: prevStart, endDate: prevEnd, name: 'previous' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'purchaseRevenue' },
      ],
    });

    // Traffic by source/medium
    const [sourceRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'activeUsers' }, { name: 'purchaseRevenue' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    });

    // Device category
    const [deviceRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    });

    // Previous year daily (for trend YoY lines)
    const [dailyPrevRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    // Previous year sources
    const [sourcePrevRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'activeUsers' }, { name: 'purchaseRevenue' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    });

    // Previous year devices
    const [devicePrevRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    });

    // Checkout funnel by device
    const [funnelRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }, { name: 'deviceCategory' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'] },
        },
      },
    });

    // Funnel trend — daily counts by step × device
    const [funnelTrendRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }, { name: 'eventName' }, { name: 'deviceCategory' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'] },
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    // Landing pages by sessions
    const [landingRes] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    });

    const daily = dailyRes.rows?.map(row => ({
      date:        row.dimensionValues?.[0].value ?? '',
      sessions:    Number(row.metricValues?.[0].value ?? 0),
      users:       Number(row.metricValues?.[1].value ?? 0),
      conversions: Number(row.metricValues?.[2].value ?? 0),
      bounceRate:  Math.round(Number(row.metricValues?.[3].value ?? 0) * 100),
      avgDuration: Math.round(Number(row.metricValues?.[4].value ?? 0)),
    })) ?? [];

    // Parse aggregate rows — GA4 returns one row per dateRange when no dimensions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseAgg = (row: any) => {
      if (!row) return { sessions: 0, users: 0, conversions: 0, bounceRate: 0, avgDuration: 0, revenue: 0 };
      return {
        sessions:    Number(row.metricValues?.[0]?.value ?? 0),
        users:       Number(row.metricValues?.[1]?.value ?? 0),
        conversions: Number(row.metricValues?.[2]?.value ?? 0),
        bounceRate:  Math.round(Number(row.metricValues?.[3]?.value ?? 0) * 100),
        avgDuration: Math.round(Number(row.metricValues?.[4]?.value ?? 0)),
        revenue:     Number(row.metricValues?.[5]?.value ?? 0),
      };
    };

    const rows = aggRes.rows ?? [];
    const totals = {
      current:  parseAgg(rows[0]),
      previous: parseAgg(rows[1]),
    };

    const parseSourceRows = (res: typeof sourceRes) => res.rows?.map(row => ({
      source:      row.dimensionValues?.[0].value ?? '',
      medium:      row.dimensionValues?.[1].value ?? '',
      sessions:    Number(row.metricValues?.[0].value ?? 0),
      conversions: Number(row.metricValues?.[1].value ?? 0),
      users:       Number(row.metricValues?.[2].value ?? 0),
      revenue:     Number(row.metricValues?.[3].value ?? 0),
    })) ?? [];

    const parseDeviceRows = (res: typeof deviceRes) => res.rows?.map(row => ({
      device:   row.dimensionValues?.[0].value ?? '',
      sessions: Number(row.metricValues?.[0].value ?? 0),
      users:    Number(row.metricValues?.[1].value ?? 0),
    })) ?? [];

    const sources      = parseSourceRows(sourceRes);
    const sourcesPrev  = parseSourceRows(sourcePrevRes);
    const devices      = parseDeviceRows(deviceRes);
    const devicesPrev  = parseDeviceRows(devicePrevRes);

    const dailyPrev = dailyPrevRes.rows?.map(row => ({
      date:        row.dimensionValues?.[0].value ?? '',
      sessions:    Number(row.metricValues?.[0].value ?? 0),
      users:       Number(row.metricValues?.[1].value ?? 0),
      conversions: Number(row.metricValues?.[2].value ?? 0),
      bounceRate:  Math.round(Number(row.metricValues?.[3].value ?? 0) * 100),
      avgDuration: Math.round(Number(row.metricValues?.[4].value ?? 0)),
    })) ?? [];

    const landingPages = landingRes.rows?.map(row => ({
      page:        row.dimensionValues?.[0].value ?? '',
      sessions:    Number(row.metricValues?.[0].value ?? 0),
      users:       Number(row.metricValues?.[1].value ?? 0),
      conversions: Number(row.metricValues?.[2].value ?? 0),
    })) ?? [];

    // Parse funnel — aggregate event counts by step × device
    const FUNNEL_STEPS = ['begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'];
    const funnelMap: Record<string, { desktop: number; mobile: number; tablet: number }> = {};
    for (const step of FUNNEL_STEPS) funnelMap[step] = { desktop: 0, mobile: 0, tablet: 0 };
    for (const row of funnelRes.rows ?? []) {
      const event  = row.dimensionValues?.[0].value ?? '';
      const device = row.dimensionValues?.[1].value ?? '';
      const count  = Number(row.metricValues?.[0].value ?? 0);
      if (funnelMap[event] && (device === 'desktop' || device === 'mobile' || device === 'tablet')) {
        funnelMap[event][device] += count;
      }
    }
    const funnel = FUNNEL_STEPS.map(step => ({
      step,
      desktop: funnelMap[step].desktop,
      mobile:  funnelMap[step].mobile,
      tablet:  funnelMap[step].tablet,
      total:   funnelMap[step].desktop + funnelMap[step].mobile + funnelMap[step].tablet,
    }));

    // Parse funnel trend — group by date, each row has counts per step × device
    const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
    const trendMap: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of funnelTrendRes.rows ?? []) {
      const date   = row.dimensionValues?.[0].value ?? '';
      const event  = row.dimensionValues?.[1].value ?? '';
      const device = row.dimensionValues?.[2].value ?? '';
      const count  = Number(row.metricValues?.[0].value ?? 0);
      if (!FUNNEL_STEPS.includes(event)) continue;
      if (!trendMap[date]) trendMap[date] = {};
      if (!trendMap[date][device]) trendMap[date][device] = {};
      trendMap[date][device][event] = (trendMap[date][device][event] ?? 0) + count;
    }
    const funnelTrend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dev]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row: Record<string, any> = { date };
        for (const d of DEVICES) {
          for (const s of FUNNEL_STEPS) row[`${s}_${d}`] = dev[d]?.[s] ?? 0;
        }
        for (const s of FUNNEL_STEPS) {
          row[`${s}_all`] = DEVICES.reduce((sum, d) => sum + (dev[d]?.[s] ?? 0), 0);
        }
        return row;
      });

    return NextResponse.json({ daily, dailyPrev, totals, sources, sourcesPrev, devices, devicesPrev, landingPages, funnel, funnelTrend });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GA4 error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
