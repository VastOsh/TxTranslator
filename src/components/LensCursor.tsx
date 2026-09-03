'use client';

import { useEffect, useRef } from 'react';

// The Renzu lens cursor for the tool pages. Self-contained (not tied to the
// hub's .renzu scope): it hides the native cursor while mounted, follows the
// pointer with a soft trail, grows over interactive elements, and steps aside
// for the native caret over text fields. Hover detection is delegated on the
// document so it also covers content rendered after a search.
export default function LensCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer:fine)').matches) return;
    const cur = ref.current;
    if (!cur) return;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    document.documentElement.classList.add('lens-cursoron');

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty, raf = 0;
    const onMove = (e: MouseEvent) => {
      tx = e.clientX; ty = e.clientY;
      if (reduce) cur.style.transform = `translate(${tx}px,${ty}px)`;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    if (!reduce) {
      const loop = () => {
        cx += (tx - cx) * 0.32; cy += (ty - cy) * 0.32;
        cur.style.transform = `translate(${cx}px,${cy}px)`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    const HOT = 'a,button,input,textarea,select,[role="button"],summary,label';
    const TEXT = 'input,textarea,select,[contenteditable]';
    const onOver = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(TEXT)) { cur.style.opacity = '0'; cur.classList.remove('is-hot'); return; }
      cur.style.opacity = '1';
      if (t && t.closest(HOT)) cur.classList.add('is-hot');
      else cur.classList.remove('is-hot');
    };
    const hide = () => { cur.style.opacity = '0'; };
    const show = () => { cur.style.opacity = '1'; };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseleave', hide);
    document.addEventListener('mouseenter', show);

    return () => {
      document.documentElement.classList.remove('lens-cursoron');
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseleave', hide);
      document.removeEventListener('mouseenter', show);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lens-cursor" ref={ref} aria-hidden="true">
      <div className="lens-cursor-in">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="14" stroke="#35C9BE" strokeWidth="1.4" opacity=".9" />
          <circle cx="17" cy="17" r="7.5" stroke="#9AA3B5" strokeWidth="1.1" opacity=".65" />
          <circle cx="17" cy="17" r="2" fill="#35C9BE" />
        </svg>
      </div>
    </div>
  );
}
