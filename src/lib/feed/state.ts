// Feed state on Upstash Redis via its REST API (no client dependency).
// Without UPSTASH_* env vars a per-instance memory fallback is used — fine
// for dry runs, but live publishing is refused (dedup wouldn't survive
// across serverless invocations and the feed would double-post).

const CHECKPOINT_KEY = 'feed:checkpoint'; // newest executedAt (ms) processed
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
}

function hourBucket(): string {
  return `feed:rate:${Math.floor(Date.now() / 3_600_000)}`;
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
}

const memory = {
  checkpoint: 0,
  posted: new Set<string>(),
  subCooldown: new Map<string, number>(), // subaccountId → expiry ms
  rate: new Map<string, number>(),
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
}

export function createState(): FeedState {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashState(url, token);
  return new MemoryState();
}
