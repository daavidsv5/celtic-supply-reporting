import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const DEVELOPER_TOKEN   = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
const CLIENT_ID         = process.env.GOOGLE_ADS_CLIENT_ID!;
const CLIENT_SECRET     = process.env.GOOGLE_ADS_CLIENT_SECRET!;
const REFRESH_TOKEN     = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
const LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!;
const BASE = 'https://googleads.googleapis.com/v18';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error_description ?? json.error);
  return json.access_token;
}

function getCustomerId(country: string): string {
  if (country === 'sk') return process.env.GOOGLE_ADS_CUSTOMER_ID_SK!;
  return process.env.GOOGLE_ADS_CUSTOMER_ID_CZ!;
}

function aggregateKpi(rows: any[]) {
  let spend = 0, clicks = 0, impressions = 0, conversions = 0, convValue = 0;
  for (const r of rows) {
    spend       += (Number(r.metrics?.costMicros) || 0) / 1_000_000;
    clicks      += Number(r.metrics?.clicks)      || 0;
    impressions += Number(r.metrics?.impressions) || 0;
    conversions += Number(r.metrics?.conversions) || 0;
    convValue   += Number(r.metrics?.conversionsValue) || 0;
  }
  return {
    spend, clicks, impressions, conversions, convValue,
    ctr:  impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc:  clicks > 0 ? spend / clicks : 0,
    cpa:  conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? convValue / spend : 0,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from    = searchParams.get('from');
  const to      = searchParams.get('to');
  const country = searchParams.get('country') ?? 'sk';

  const customerId = getCustomerId(country);

  const dateCond = from && to
    ? `segments.date BETWEEN '${from}' AND '${to}'`
    : `segments.date DURING LAST_30_DAYS`;

  let prevDateCond = '';
  if (from && to) {
    const pf = new Date(from); pf.setFullYear(pf.getFullYear() - 1);
    const pt = new Date(to);   pt.setFullYear(pt.getFullYear() - 1);
    prevDateCond = `segments.date BETWEEN '${pf.toISOString().split('T')[0]}' AND '${pt.toISOString().split('T')[0]}'`;
  } else {
    prevDateCond = `segments.date DURING LAST_YEAR`;
  }

  try {
    const accessToken = await getAccessToken();

    const headers: Record<string, string> = {
      'Authorization':     `Bearer ${accessToken}`,
      'developer-token':   DEVELOPER_TOKEN,
      'login-customer-id': LOGIN_CUSTOMER_ID,
      'Content-Type':      'application/json',
    };

    function search(query: string) {
      return fetch(`${BASE}/customers/${customerId}/googleAds:search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      }).then(r => r.json());
    }

    const [kpiJson, prevKpiJson, dailyJson] = await Promise.all([
      search(`
        SELECT
          campaign.name,
          campaign.status,
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.conversions,
          metrics.conversions_value,
          metrics.average_cpc,
          metrics.cost_per_conversion
        FROM campaign
        WHERE ${dateCond}
          AND campaign.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
      `),
      search(`
        SELECT
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE ${prevDateCond}
          AND campaign.status != 'REMOVED'
      `),
      search(`
        SELECT
          segments.date,
          metrics.cost_micros,
          metrics.clicks,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE ${dateCond}
          AND campaign.status != 'REMOVED'
        ORDER BY segments.date ASC
      `),
    ]);

    if (kpiJson.error) {
      return NextResponse.json({ error: kpiJson.error.message ?? JSON.stringify(kpiJson.error) }, { status: 400 });
    }

    const kpi     = aggregateKpi(kpiJson.results    ?? []);
    const prevKpi = aggregateKpi(prevKpiJson.results ?? []);

    const campaigns = (kpiJson.results ?? [])
      .map((r: any) => ({
        name:        r.campaign?.name ?? '–',
        status:      r.campaign?.status ?? '',
        spend:       (Number(r.metrics?.costMicros) || 0) / 1_000_000,
        clicks:      Number(r.metrics?.clicks)      || 0,
        impressions: Number(r.metrics?.impressions) || 0,
        cpc:         (Number(r.metrics?.averageCpc) || 0) / 1_000_000,
        conversions: Number(r.metrics?.conversions) || 0,
        convValue:   Number(r.metrics?.conversionsValue) || 0,
        cpa:         (Number(r.metrics?.costPerConversion) || 0) / 1_000_000,
      }))
      .filter((c: any) => c.spend > 0);

    const dailyByDate: Record<string, { spend: number; clicks: number; conversions: number; convValue: number }> = {};
    for (const r of (dailyJson.results ?? [])) {
      const date = r.segments?.date;
      if (!date) continue;
      if (!dailyByDate[date]) dailyByDate[date] = { spend: 0, clicks: 0, conversions: 0, convValue: 0 };
      dailyByDate[date].spend       += (Number(r.metrics?.costMicros) || 0) / 1_000_000;
      dailyByDate[date].clicks      += Number(r.metrics?.clicks)      || 0;
      dailyByDate[date].conversions += Number(r.metrics?.conversions) || 0;
      dailyByDate[date].convValue   += Number(r.metrics?.conversionsValue) || 0;
    }

    const daily = Object.entries(dailyByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        spend:       v.spend,
        clicks:      v.clicks,
        cpc:         v.clicks > 0 ? v.spend / v.clicks : 0,
        conversions: v.conversions,
        cpa:         v.conversions > 0 ? v.spend / v.conversions : 0,
        roas:        v.spend > 0 ? v.convValue / v.spend : 0,
      }));

    return NextResponse.json({ kpi, prevKpi, campaigns, daily });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 });
  }
}
