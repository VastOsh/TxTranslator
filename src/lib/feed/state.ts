// Feed state on Upstash Redis via its REST API (no client dependency).
// Without UPSTASH_* env vars a per-instance memory fallback is used — fine
// for dry runs, but live publishing is refused (dedup wouldn't survive
// across serverless invocations and the feed would double-post).

import { NOTIONALS_WINDOW_MS } from './thresholds';

const CHECKPOINT_KEY = 'feed:checkpoint'; // newest executedAt (ms) processed
const NOTIONALS_KEY = 'feed:notionals'; // 24h rolling window, score = executedAt
const XERROR_KEY = 'feed:xlasterror'; // last X publish failure {detail, at}
const XALERT_KEY = 'feed:xalert'; // NX throttle so alerts don't fire every tick
const POSTED_TTL_S = 48 * 3600;

export interface FeedState {
  persistent: boolean;
  getCheckpoint(): Promise<number>;
  setCheckpoint(timestampMs: number): Promise<void>;
  /** Atomic test-and-set dedup. True = first time seen, safe to post. */
  tryMarkPosted(key: string): Promise<boolean>;
  /** Per-subaccount cooldown. True = not on cooldown, safe to post. */
  trySubaccountCooldown(subaccountId: string, ttlS: number): Promise<boolean>;
  /** Increments and returns this hour's post count. */
  incrPostCount(): Promise<number>;
  /** Increments and returns today's X post count (X is pay-per-use). */
  incrXPostCount(): Promise<number>;
  /** Reads today's X post count without incrementing — observability. */
  getXPostCount(): Promise<number>;
  /** Record the most recent X publish failure (persists until cleared). */
  recordXError(detail: string): Promise<void>;
  /** Read the most recent X publish failure, or null if none outstanding. */
  getXError(): Promise<XErrorRecord | null>;
  /** Clear the recorded X failure — called after a successful X post. */
  clearXError(): Promise<void>;
  /** True at most once per ttl window — throttles X-failure alerts. */
  shouldAlertXError(ttlS: number): Promise<boolean>;
  /**
   * Add entries to the 24h rolling notionals window, prune expired ones,
   * and return every notional still in the window, ascending.
   */
  recordNotionals(entries: NotionalEntry[]): Promise<number[]>;
}

export interface NotionalEntry {
  executedAt: number; // ms — the window is pruned on this
  orderHash: string;
  notionalUsd: number;
}

export interface XErrorRecord {
  detail: string;
  at: number; // ms epoch of the failure
}

function hourBucket(): string {
  return `feed:rate:${Math.floor(Date.now() / 3_600_000)}`;
}

function dayBucket(): string {
  return `feed:xrate:${Math.floor(Date.now() / 86_400_000)}`;
}

class UpstashState implements FeedState {
  persistent = true;
  constructor(private url: string, private token: string) {}

  private async cmd(parts: (string | number)[]): Promise<any> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parts.map(String)),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Upstash: ${data.error}`);
    return data.result;
  }

  async getCheckpoint(): Promise<number> {
    const v = await this.cmd(['GET', CHECKPOINT_KEY]);
    return v ? parseInt(v, 10) : 0;
  }

  async setCheckpoint(timestampMs: number): Promise<void> {
    await this.cmd(['SET', CHECKPOINT_KEY, timestampMs]);
  }

  async tryMarkPosted(key: string): Promise<boolean> {
    const v = await this.cmd(['SET', `feed:posted:${key}`, '1', 'NX', 'EX', POSTED_TTL_S]);
    return v === 'OK';
  }

  async trySubaccountCooldown(subaccountId: string, ttlS: number): Promise<boolean> {
    const v = await this.cmd(['SET', `feed:sub:${subaccountId}`, '1', 'NX', 'EX', ttlS]);
    return v === 'OK';
  }

  async incrPostCount(): Promise<number> {
    const key = hourBucket();
    const count = await this.cmd(['INCR', key]);
    if (count === 1) await this.cmd(['EXPIRE', key, 3900]);
    return count;
  }

  async incrXPostCount(): Promise<number> {
    const key = dayBucket();
    const count = await this.cmd(['INCR', key]);
    if (count === 1) await this.cmd(['EXPIRE', key, 90_000]);
    return count;
  }

  async getXPostCount(): Promise<number> {
    const v = await this.cmd(['GET', dayBucket()]);
    return v ? parseInt(v, 10) : 0;
  }

  async recordXError(detail: string): Promise<void> {
    await this.cmd(['SET', XERROR_KEY, JSON.stringify({ detail, at: Date.now() })]);
  }

  async getXError(): Promise<XErrorRecord | null> {
    const v = await this.cmd(['GET', XERROR_KEY]);
    if (!v) return null;
    try {
      const p = JSON.parse(v);
      return typeof p?.detail === 'string' ? { detail: p.detail, at: Number(p.at) || 0 } : null;
    } catch {
      return null;
    }
  }

  async clearXError(): Promise<void> {
    // Drop the outstanding error and the alert throttle so a later failure
    // re-alerts immediately rather than waiting out a stale cooldown.
    await this.cmd(['DEL', XERROR_KEY, XALERT_KEY]);
  }

  async shouldAlertXError(ttlS: number): Promise<boolean> {
    const v = await this.cmd(['SET', XALERT_KEY, '1', 'NX', 'EX', ttlS]);
    return v === 'OK';
  }

  async recordNotionals(entries: NotionalEntry[]): Promise<number[]> {
    if (entries.length > 0) {
      const args: (string | number)[] = ['ZADD', NOTIONALS_KEY];
      for (const e of entries) {
        args.push(e.executedAt, `${e.orderHash}:${Math.round(e.notionalUsd)}`);
      }
      await this.cmd(args);
      // Self-destruct if the feed stops running; the window otherwise
      // prunes itself by score below.
      await this.cmd(['EXPIRE', NOTIONALS_KEY, Math.ceil(NOTIONALS_WINDOW_MS / 1000) + 3600]);
    }
    await this.cmd(['ZREMRANGEBYSCORE', NOTIONALS_KEY, 0, Date.now() - NOTIONALS_WINDOW_MS]);
    const members: string[] = (await this.cmd(['ZRANGE', NOTIONALS_KEY, 0, -1])) ?? [];
    return members
      .map((m) => parseInt(m.slice(m.lastIndexOf(':') + 1), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }
}

const memory = {
  checkpoint: 0,
  posted: new Set<string>(),
  subCooldown: new Map<string, number>(), // subaccountId → expiry ms
  rate: new Map<string, number>(),
  notionals: new Map<string, { executedAt: number; notionalUsd: number }>(),
  xError: null as XErrorRecord | null,
  xAlertUntil: 0, // ms — alert throttle expiry
};

class MemoryState implements FeedState {
  persistent = false;

  async getCheckpoint(): Promise<number> {
    return memory.checkpoint;
  }

  async setCheckpoint(timestampMs: number): Promise<void> {
    memory.checkpoint = timestampMs;
  }

  async tryMarkPosted(key: string): Promise<boolean> {
    if (memory.posted.has(key)) return false;
    memory.posted.add(key);
    return true;
  }

  async trySubaccountCooldown(subaccountId: string, ttlS: number): Promise<boolean> {
    const until = memory.subCooldown.get(subaccountId);
    if (until && until > Date.now()) return false;
    memory.subCooldown.set(subaccountId, Date.now() + ttlS * 1000);
    return true;
  }

  async incrPostCount(): Promise<number> {
    const key = hourBucket();
    const next = (memory.rate.get(key) ?? 0) + 1;
    memory.rate.set(key, next);
    return next;
  }

  async incrXPostCount(): Promise<number> {
    const key = dayBucket();
    const next = (memory.rate.get(key) ?? 0) + 1;
    memory.rate.set(key, next);
    return next;
  }

  async getXPostCount(): Promise<number> {
    return memory.rate.get(dayBucket()) ?? 0;
  }

  async recordXError(detail: string): Promise<void> {
    memory.xError = { detail, at: Date.now() };
  }

  async getXError(): Promise<XErrorRecord | null> {
    return memory.xError;
  }

  async clearXError(): Promise<void> {
    memory.xError = null;
    memory.xAlertUntil = 0;
  }

  async shouldAlertXError(ttlS: number): Promise<boolean> {
    if (memory.xAlertUntil > Date.now()) return false;
    memory.xAlertUntil = Date.now() + ttlS * 1000;
    return true;
  }

  async recordNotionals(entries: NotionalEntry[]): Promise<number[]> {
    for (const e of entries) {
      memory.notionals.set(e.orderHash, { executedAt: e.executedAt, notionalUsd: e.notionalUsd });
    }
    const cutoff = Date.now() - NOTIONALS_WINDOW_MS;
    for (const [k, v] of memory.notionals) {
      if (v.executedAt < cutoff) memory.notionals.delete(k);
    }
    return [...memory.notionals.values()].map((v) => v.notionalUsd).sort((a, b) => a - b);
  }
}

export function createState(): FeedState {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashState(url, token);
  return new MemoryState();
}
