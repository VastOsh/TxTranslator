import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Default social card for the hub and for every lens without its own image.
export const alt = 'Renzu, every lens on Injective';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

const TEAL = '#35C9BE';
const VIOLET = '#9B8CFF';
const AMBER = '#F0B24A';
const INK = '#0A0B0F';

const VALID_FONT_SIGS = ['00010000', '74727565', '4f54544f'];

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public/fonts/Inter-Bold.ttf'));
    const sig = buf.slice(0, 4).toString('hex');
    if (!VALID_FONT_SIGS.includes(sig)) return null;
    return buf.buffer as ArrayBuffer;
  } catch {
    return null;
  }
}

export default async function Image() {
  const fontData = await loadFont();
  const fontFamily = fontData ? 'Inter' : 'sans-serif';

  const card = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: INK,
        backgroundImage: `radial-gradient(ellipse 900px 620px at -60px -80px, ${TEAL}22, transparent 62%), radial-gradient(ellipse 700px 520px at 1120px 700px, ${VIOLET}1c, transparent 60%)`,
      }}
    >
      {/* Top spectrum line */}
      <div
        style={{
          width: '100%',
          height: 4,
          display: 'flex',
          background: `linear-gradient(to right, ${TEAL}, ${VIOLET}, ${AMBER})`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '52px 64px 44px',
          justifyContent: 'space-between',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${TEAL}, ${VIOLET} 55%, ${AMBER})`,
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 11, display: 'flex', background: INK }} />
            </div>
            <span
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: '#ECEFF5',
                letterSpacing: '0.14em',
                fontFamily,
              }}
            >
              RENZU
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '8px 20px',
              border: `1px solid ${TEAL}44`,
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 15, letterSpacing: '0.14em', color: `${TEAL}cc`, fontFamily }}>
              INJECTIVE INTELLIGENCE HUB
            </span>
          </div>
        </div>

        {/* Center */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span
            style={{
              fontSize: 82,
              fontWeight: 700,
              color: '#F4F6FB',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              fontFamily,
            }}
          >
            Every lens on Injective
          </span>
          <span style={{ fontSize: 27, color: 'rgba(236,239,245,0.72)', fontFamily }}>
            Decode · Wallets · Tokens · Volume · Burn · Perps · Whales
          </span>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, color: TEAL, letterSpacing: '0.02em', fontFamily }}>
            renzu.xyz
          </span>
          <span style={{ fontSize: 18, color: 'rgba(148,163,184,0.65)', fontFamily }}>
            Read straight from the Injective chain
          </span>
        </div>
      </div>

      {/* Bottom spectrum line */}
      <div
        style={{
          width: '100%',
          height: 3,
          display: 'flex',
          background: `linear-gradient(to right, ${TEAL}66, ${VIOLET}66, ${AMBER}66)`,
        }}
      />
    </div>
  );

  try {
    return new ImageResponse(card, {
      ...size,
      fonts: fontData ? [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }] : [],
    });
  } catch (err) {
    console.error('[og-image:hub] ImageResponse render failed:', err);
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: INK,
            color: '#ECEFF5',
            fontSize: 48,
            fontFamily: 'sans-serif',
          }}
        >
          Renzu, every lens on Injective
        </div>
      ),
      size,
    );
  }
}
