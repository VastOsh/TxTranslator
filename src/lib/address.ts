// ── Injective address conversion (bech32 ⇄ EVM hex) ─────────────────────────
// An Injective account is one 20-byte key with two textual forms: the `inj1…`
// bech32 address (Cosmos side) and the `0x…` hex address (EVM side). Some data
// sources speak one dialect only — the explorer indexer wants inj1, the
// launchpad backend and the OFAC list are hex — so we convert freely between
// them. BIP-173 bech32, no external dependency.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CHARSET_REV: Record<string, number> = {};
for (let i = 0; i < CHARSET.length; i++) CHARSET_REV[CHARSET[i]] = i;

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  return [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
}

/** 20-byte hex (with or without 0x) → `inj1…` bech32 address, or null if malformed. */
export function hexToInj(hexInput: string): string | null {
  const hex = hexInput.replace(/^0x/i, '').slice(0, 40).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) return null;
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < 40; i += 2) {
    acc = (acc << 8) | parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  const hrp = 'inj';
  const pm = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (pm >> (5 * (5 - i))) & 31);
  return `inj1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`;
}

/** `inj1…` bech32 address → 20-byte lowercase hex (no 0x), or null if malformed. */
export function injToHex(addr: string): string | null {
  const a = addr.trim().toLowerCase();
  if (!/^inj1[0-9a-z]{38,}$/.test(a)) return null;
  const data = a.slice(4); // after the 'inj' hrp + '1' separator
  const values: number[] = [];
  for (const ch of data) {
    const v = CHARSET_REV[ch];
    if (v === undefined) return null;
    values.push(v);
  }
  // Verify the checksum, then drop it.
  if (polymod([...hrpExpand('inj'), ...values]) !== 1) return null;
  const words = values.slice(0, -6);
  // 5-bit words → bytes.
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  if (bytes.length < 20) return null;
  return bytes.slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Accept either form → the `inj1…` address (null if neither parses). */
export function toInj(input: string): string | null {
  const s = input.trim();
  if (/^inj1[0-9a-z]{38,}$/i.test(s)) return injToHex(s.toLowerCase()) ? s.toLowerCase() : null;
  if (/^0x?[0-9a-f]{40}$/i.test(s)) return hexToInj(s);
  return null;
}

/** Accept either form → 20-byte lowercase hex, no 0x (null if neither parses). */
export function toHex(input: string): string | null {
  const s = input.trim();
  if (/^0x[0-9a-f]{40}$/i.test(s) || /^[0-9a-f]{40}$/i.test(s)) return s.replace(/^0x/i, '').toLowerCase();
  if (/^inj1[0-9a-z]{38,}$/i.test(s)) return injToHex(s.toLowerCase());
  return null;
}
