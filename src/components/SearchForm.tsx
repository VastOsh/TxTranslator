'use client';

import { useState, useRef } from 'react';

interface Props {
  onSearch: (hash: string) => void;
  loading: boolean;
}

const HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export default function SearchForm({ onSearch, loading }: Props) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const isValid = HASH_RE.test(trimmed);
  const showError = touched && trimmed.length >= 6 && !isValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid || loading) return;
    onSearch(trimmed);
  }

  return (
    <form className="tx-search-wrap" onSubmit={handleSubmit} noValidate>
      <div className="tx-search-bar">
        <input
          ref={inputRef}
          className="tx-input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="0xA1B2C3… or ABCDEF1234…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={loading}
          aria-label="Transaction hash"
        />
        <button
          type="submit"
          className="tx-btn"
          disabled={loading || (touched && !isValid && trimmed.length > 0)}
          aria-label="Decode transaction"
          aria-busy={loading}
        >
          {loading ? (
            <>
              <div className="tx-spinner" />
              Decoding
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Decode
            </>
          )}
        </button>
      </div>

      {showError && (
        <p className="tx-error-msg">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Must be a 64-character hex hash (with or without 0x prefix)
        </p>
      )}
    </form>
  );
}
