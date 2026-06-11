import https from 'node:https';
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { MANUAL_BANNER_ITEMS } from '@/data/banner';
import type { BannerItem } from '@/data/banner';

const agent = new https.Agent({ rejectUnauthorized: false });
const HEADERS = { Accept: 'application/json' };
const LCD = 'https://injective-api.polkachu.com';
const BLOCK_TIME_S = 1.5;

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve) => {
    const req = https.get(url, { agent, headers: HEADERS }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

async function fetchUpgradeItem(): Promise<BannerItem | null> {
  const [planData, blockData] = await Promise.all([
    fetchJson(`${LCD}/cosmos/upgrade/v1beta1/current_plan`),
    fetchJson(`${LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`),
  ]);

  const plan = planData?.plan;
  if (!plan?.name || !plan?.height) return null;

  const targetHeight = parseInt(plan.height, 10);
  const currentHeight = parseInt(blockData?.block?.header?.height ?? '0', 10);
  const blocksLeft = targetHeight - currentHeight;

  let timeStr = '';
  if (blocksLeft > 0 && currentHeight > 0) {
    const secs = blocksLeft * BLOCK_TIME_S;
    if (secs < 3600)       timeStr = ` in ~${Math.round(secs / 60)}m`;
    else if (secs < 86400) timeStr = ` in ~${Math.round(secs / 3600)}h`;
    else                   timeStr = ` in ~${Math.round(secs / 86400)}d`;
  }

  return {
    id: `upgrade-${plan.name}`,
    type: 'warning',
    text: `Chain upgrade to ${plan.name} scheduled${timeStr} — validators halt at block ${targetHeight.toLocaleString()}.`,
    link: 'https://docs.injective.network',
    linkText: 'Injective Docs ↗',
  };
}

const CRITICAL_RE = /settle|settlement|delist|halt|emergency|critical|liquidat|close/i;
const WARNING_RE  = /upgrade|migration|migrate|suspend|deprecat/i;

async function fetchGovernanceItems(): Promise<BannerItem[]> {
  const data = await fetchJson(
    `${LCD}/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_VOTING_PERIOD&pagination.limit=20`,
  );

  const proposals: any[] = data?.proposals ?? [];
  const items: BannerItem[] = [];

  for (const p of proposals) {
    const title: string   = p.title ?? '';
    const summary: string = p.summary ?? '';
    const combined = `${title} ${summary}`;

    let type: BannerItem['type'] | null = null;
    if (CRITICAL_RE.test(combined)) type = 'critical';
    else if (WARNING_RE.test(combined)) type = 'warning';
    if (!type) continue;

    const end = p.voting_end_time ? new Date(p.voting_end_time) : null;
    const dateStr = end && !isNaN(end.getTime())
      ? ` — vote ends ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : '';

    items.push({
      id: `gov-${p.id}`,
      type,
      text: `Proposal #${p.id}: ${title}${dateStr}.`,
      link: `https://hub.injective.network/governance/${p.id}`,
      linkText: 'View proposal ↗',
    });
  }

  return items;
}

async function fetchAllNews(): Promise<BannerItem[]> {
  const [upgradeItem, govItems] = await Promise.all([
    fetchUpgradeItem().catch(() => null),
    fetchGovernanceItems().catch(() => []),
  ]);

  const items: BannerItem[] = [];
  if (upgradeItem) items.push(upgradeItem);
  items.push(...govItems, ...MANUAL_BANNER_ITEMS);

  const priority = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => priority[a.type] - priority[b.type]);
}

const getCachedNews = unstable_cache(fetchAllNews, ['injective-news'], { revalidate: 300 });

export async function GET() {
  try {
    const items = await getCachedNews();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: MANUAL_BANNER_ITEMS });
  }
}
