import https from 'node:https';
import zlib from 'node:zlib';
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

// Injective ecosystem news for the hub's News section. Two honest, current
// sources, no API key: Injective's own blog (injective.com/blog) and live
// on-chain governance + chain upgrades. Newest first. If a source is down the
// feed degrades to whatever is reachable rather than inventing anything.

export interface InjNewsItem {
  id: string;
  kind: 'Blog' | 'Governance' | 'Upgrade';
  accent: string;   // Renzu brand token (hex)
  date: string;     // YYYY-MM-DD
  title: string;
  blurb: string;
  href: string;
  external: boolean;
  cta: string;
}

const TEAL = '#35C9BE';
const VIOLET = '#9B8CFF';
const AMBER = '#F0B24A';

const LCD = 'https://injective-api.polkachu.com';
const BLOCK_TIME_S = 1.5;

const HEADERS = {
  Accept: 'text/html,application/json,application/xhtml+xml',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Encoding': 'gzip, deflate, br',
};

function httpGetText(url: string, timeoutMs = 12_000): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: HEADERS }, (res) => {
      const enc = (res.headers['content-encoding'] ?? '').toLowerCase();
      const stream =
        enc === 'gzip' ? res.pipe(zlib.createGunzip())
        : enc === 'deflate' ? res.pipe(zlib.createInflate())
        : enc === 'br' ? res.pipe(zlib.createBrotliDecompress())
        : res;
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on('error', () => resolve(null));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
  });
}

async function fetchJson(url: string): Promise<any> {
  const text = await httpGetText(url, 8_000);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } });
}

function clean(s: string, max = 155): string {
  let t = decodeEntities(s)
    .replace(/<[^>]*>/g, ' ')
    // strip leading decorative emoji / arrows / bullets, keep $, letters, quotes
    .replace(/^[\s\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}•·]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
  return t;
}

function toDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Injective's blog is a Nuxt app; the post list ships in the __NUXT_DATA__
// payload as a flat array where object fields are indices into that same array
// (Nuxt's devalue format). Resolve title/slug/excerpt/date by index lookup.
async function fetchBlog(): Promise<InjNewsItem[]> {
  const html = await httpGetText('https://injective.com/blog');
  if (!html) return [];
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];

  let arr: any[];
  try { arr = JSON.parse(m[1]); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  const R = (i: any) => (Number.isInteger(i) && i >= 0 && i < arr.length ? arr[i] : i);

  const bySlug = new Map<string, InjNewsItem>();
  for (const v of arr) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (!('title' in v) || !('slug' in v) || !('excerpt' in v)) continue;

    const title = R(v.title);
    const slug = R(v.slug);
    if (typeof title !== 'string' || typeof slug !== 'string' || !slug) continue;
    if (bySlug.has(slug)) continue;

    const date = toDate(R(v.ghostPublishedAt)) || toDate(R(v.publishedAt));
    const excerpt = R(v.excerpt);

    bySlug.set(slug, {
      id: `blog-${slug}`,
      kind: 'Blog',
      accent: TEAL,
      date,
      title: decodeEntities(title).trim(),
      blurb: typeof excerpt === 'string' ? clean(excerpt) : '',
      href: `https://injective.com/blog/${slug}`,
      external: true,
      cta: 'Read on Injective',
    });
  }

  return [...bySlug.values()].filter((i) => i.date).slice(0, 8);
}

const STATUS_LABEL: Record<string, string> = {
  PROPOSAL_STATUS_VOTING_PERIOD: 'In voting',
  PROPOSAL_STATUS_PASSED: 'Passed',
  PROPOSAL_STATUS_REJECTED: 'Rejected',
  PROPOSAL_STATUS_FAILED: 'Failed',
  PROPOSAL_STATUS_DEPOSIT_PERIOD: 'In deposit',
};

function govTitle(p: any): string {
  const t = p?.title || p?.messages?.[0]?.proposal?.title || p?.messages?.[0]?.content?.title || '';
  return typeof t === 'string' ? t.trim() : '';
}
function govSummary(p: any): string {
  const s = p?.summary || p?.messages?.[0]?.proposal?.description || p?.messages?.[0]?.content?.description || '';
  return typeof s === 'string' ? s : '';
}

async function fetchGovernance(): Promise<InjNewsItem[]> {
  const data = await fetchJson(
    `${LCD}/cosmos/gov/v1/proposals?pagination.limit=8&pagination.reverse=true`,
  );
  const proposals: any[] = data?.proposals ?? [];
  const items: InjNewsItem[] = [];

  for (const p of proposals) {
    const title = govTitle(p);
    if (!title) continue;
    const status = p.status ?? '';
    const label = STATUS_LABEL[status] ?? '';
    const voting = status === 'PROPOSAL_STATUS_VOTING_PERIOD';
    const date = toDate(p.submit_time) || toDate(p.voting_start_time);

    items.push({
      id: `gov-${p.id}`,
      kind: 'Governance',
      accent: VIOLET,
      date,
      title: `#${p.id}: ${title}`,
      blurb: [label, clean(govSummary(p), 130)].filter(Boolean).join(' · '),
      href: `https://hub.injective.network/governance/${p.id}`,
      external: true,
      cta: voting ? 'Vote on Hub' : 'View proposal',
    });
  }

  return items.filter((i) => i.date).slice(0, 3);
}

async function fetchUpgrade(): Promise<InjNewsItem[]> {
  const [planData, blockData] = await Promise.all([
    fetchJson(`${LCD}/cosmos/upgrade/v1beta1/current_plan`),
    fetchJson(`${LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`),
  ]);

  const plan = planData?.plan;
  if (!plan?.name || !plan?.height) return [];

  const target = parseInt(plan.height, 10);
  const current = parseInt(blockData?.block?.header?.height ?? '0', 10);
  const blocksLeft = target - current;
  if (!(blocksLeft > 0) || !(current > 0)) return [];

  const secs = blocksLeft * BLOCK_TIME_S;
  const when =
    secs < 3600 ? `~${Math.round(secs / 60)} minutes`
    : secs < 86400 ? `~${Math.round(secs / 3600)} hours`
    : `~${Math.round(secs / 86400)} days`;

  return [{
    id: `upgrade-${plan.name}`,
    kind: 'Upgrade',
    accent: AMBER,
    date: new Date().toISOString().slice(0, 10),
    title: `Chain upgrade: ${plan.name}`,
    blurb: `Scheduled in ${when}. Validators halt at block ${target.toLocaleString()} to apply the upgrade.`,
    href: 'https://hub.injective.network/governance',
    external: true,
    cta: 'Track on Hub',
  }];
}

async function fetchAll(): Promise<InjNewsItem[]> {
  const [blog, gov, upgrade] = await Promise.all([
    fetchBlog().catch(() => [] as InjNewsItem[]),
    fetchGovernance().catch(() => [] as InjNewsItem[]),
    fetchUpgrade().catch(() => [] as InjNewsItem[]),
  ]);

  return [...upgrade, ...blog, ...gov]
    .filter((i) => i.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 9);
}

const getCachedNews = unstable_cache(fetchAll, ['inj-news'], { revalidate: 1800 });

export async function GET() {
  try {
    const items = await getCachedNews();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
