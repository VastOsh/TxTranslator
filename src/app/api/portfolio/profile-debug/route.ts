import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic — is Talis's GraphQL reachable from Vercel's egress, or
// is it Cloudflare-challenged? Returns only transport-level signals (status,
// CF headers) plus whether an id came back — never the upstream body or any
// user record, so it can't be used to harvest Talis profiles. DELETE after use.
export const maxDuration = 30;

const ADDR_RE = /^inj1[a-z0-9]{38}$/;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function GET(request: NextRequest) {
  // Defaults to a known-good profile so the probe URL needs no long query
  // string (which wraps and corrupts in some terminals).
  const address =
    request.nextUrl.searchParams.get('address') ?? 'inj1hgcvgnmlhxc92w4n579z6fcl68sewfvv2044qy';
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
  }

  const out: Record<string, unknown> = {};
  try {
    const res = await fetch('https://injective.talis.art/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://injective.talis.art',
        Referer: 'https://injective.talis.art/',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        query: 'query($i:UserInput!){user(input:$i){id}}',
        variables: { i: { filter: { walletAddress: address } } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    out.status = res.status;
    out.contentType = res.headers.get('content-type');
    out.cfRay = res.headers.get('cf-ray');
    out.server = res.headers.get('server');
    // Parse to booleans only — do not echo the body or any user field.
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => null);
      out.jsonParsed = body !== null;
      out.userIdFound = typeof body?.data?.user?.id === 'string' && !!body.data.user.id;
      out.gqlErrors = Array.isArray(body?.errors)
        ? body.errors.map((e: { message?: string }) => e?.message).slice(0, 3)
        : undefined;
    } else {
      out.jsonParsed = false;
      out.looksLikeChallenge = true; // non-JSON from a JSON endpoint ⇒ CF/HTML
    }
  } catch (err) {
    out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  return NextResponse.json(out);
}
