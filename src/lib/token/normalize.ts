// Text normalization for impersonation detection.
//
// A scammer's whole game is a name that *looks* like a trusted one to a human
// but is a different string to a computer — Cyrillic look-alikes (CULT OF ANONS
// with a Cyrillic 'О'), digit swaps (1NJ for INJ), spacing/punctuation, case.
// These helpers fold those tricks away so we can compare identities honestly,
// and also *report which trick was used* so the signal is specific.

// Confusable code points → their ASCII look-alike. Curated to the characters
// actually seen in crypto impersonation (Cyrillic, Greek, full-width, a few
// symbols). Not exhaustive by design — every entry is a real look-alike.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic → Latin
  а: 'a', в: 'b', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p',
  т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ո: 'n', օ: 'o',
  // Greek → Latin
  Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n',
  Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x', α: 'a', ο: 'o', ρ: 'p', ν: 'v',
  // Full-width → ASCII (sample; NFKD below also handles many)
  Ａ: 'a', Ｉ: 'i', Ｎ: 'n', Ｊ: 'j',
};

// Digit ↔ letter substitutions used only for the "leet" pass (1NJ → inj).
const DELEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
};

/** Replace known confusable characters with their ASCII look-alike. */
export function foldConfusables(input: string): string {
  let out = '';
  for (const ch of input) out += CONFUSABLES[ch] ?? ch;
  return out;
}

/**
 * Tight identity form: fold confusables, strip diacritics, lowercase, and keep
 * only [a-z0-9]. Two strings with the same tight form are "the same identity"
 * to a human. Used to detect homoglyph/spacing/case impersonation.
 */
export function normalizeTight(input: string): string {
  return foldConfusables(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Loose form for name matching: like tight but keeps word boundaries. */
export function normalizeLoose(input: string): string {
  return foldConfusables(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tight form with digit→letter substitution (catches 1NJ ≈ INJ, PYTH ≈ PYT4). */
export function normalizeLeet(input: string): string {
  const tight = normalizeTight(input);
  let out = '';
  for (const ch of tight) out += DELEET[ch] ?? ch;
  return out;
}

/**
 * True when `input` relies on a non-ASCII look-alike character (Cyrillic/Greek/
 * full-width). This is the tell-tale of a deliberate homoglyph, so we can name
 * it in the signal ("uses a Cyrillic letter").
 */
export function usesConfusables(input: string): boolean {
  // A letter is "confusable" if folding changes it, or it's a non-ASCII letter.
  for (const ch of input) {
    if (CONFUSABLES[ch]) return true;
    if (/\p{L}/u.test(ch) && ch.charCodeAt(0) > 127) return true;
  }
  return false;
}

/** Classic Levenshtein edit distance (small strings, so the O(n·m) DP is fine). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}
