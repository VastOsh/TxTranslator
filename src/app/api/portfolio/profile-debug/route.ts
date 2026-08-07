import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic — is Talis's GraphQL reachable from Vercel's egress, or
// is it Cloudflare-challenged? Returns the raw status + body snippet so we can
// see what the server (not my local machine) actually receives. Delete after.
export const maxDuration = 30;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') ?? '';
  const out: Record<string, unknown> = { address };
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
        query: 'query($i:UserInput!){user(input:$i){id username}}',
        variables: { i: { filter: { walletAddress: address } } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    out.status = res.status;
    out.contentType = res.headers.get('content-type');
    out.cfRay = res.headers.get('cf-ray');
    out.server = res.headers.get('server');
    const text = await res.text();
    out.bodySnippet = text.slice(0, 500);
  } catch (err) {
    out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  return NextResponse.json(out);
}
