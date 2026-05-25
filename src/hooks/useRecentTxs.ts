'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tx_recent';
const MAX_ENTRIES = 5;

export interface RecentTx {
  hash: string;
  action: string;
  txCategory: string;
  protocol: string | null;
  status: 'success' | 'failed';
  decodedAt: string;
}

function readStorage(): RecentTx[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentTx[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: RecentTx[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function useRecentTxs() {
  const [recent, setRecent] = useState<RecentTx[]>([]);

  useEffect(() => {
    setRecent(readStorage());
  }, []);

  const addRecent = useCallback((tx: Omit<RecentTx, 'decodedAt'>) => {
    setRecent(prev => {
      const filtered = prev.filter(e => e.hash !== tx.hash);
      const next = [{ ...tx, decodedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_ENTRIES);
      writeStorage(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return { recent, addRecent, clearRecent };
}
