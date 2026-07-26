'use client';

import { useState } from 'react';
import type { BuybackProfile, RoundParticipation, EligibilitySignals } from '@/lib/buyback/rounds';

interface Props {
  profile: BuybackProfile;
}

function plainUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `<$0.01`;
}

function inj(n: string): string {
  const v = parseFloat(n);
  if (!isFinite(v)) return `${n} INJ`;
  if (v >= 1000) return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} INJ`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 4 })} INJ`;
}

function shortDate(sec: number): string {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function closesIn(sec: number): string {
  const ms = sec * 1000 - Date.now();
  if (ms <= 0) return 'closed';
  const days = ms / 86_400_000;
  if (days >= 1) return `${Math.ceil(days)}d left`;
  const hrs = ms / 3_600_000;
  if (hrs >= 1) return `${Math.ceil(hrs)}h left`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}m left`;
}

function basketLabel(p: RoundParticipation): string {
  if (p.basket.length === 0) return 'No rewards recorded';
  const top = p.basket.slice(0, 3).map(b => b.symbol).join(', ');
  const more = p.basket.length > 3 ? ` +${p.basket.length - 3} more` : '';
  return `${top}${more}`;
}

/** The headline current-round status banner. */
function StatusBanner({ profile }: { profile: BuybackProfile }) {
  const { currentStatus, currentRoundId, currentRoundStartDate, currentRoundEndDate, currentRoundWalletCapInj, currentRoundFull } = profile;
  const rid = currentRoundId ?? '—';
  const ends = currentRoundEndDate ? closesIn(currentRoundEndDate) : '';
  const starts = currentRoundStartDate ? shortDate(currentRoundStartDate) : '';

  const map: Record<typeof currentStatus, { tone: string; icon: string; title: string; sub: string }> = {
    deposited: {
      tone: 'ok',
      icon: '✓',
      title: `Committed to round ${rid}`,
      sub: `This wallet has deposited into the open round. ${ends ? `Round ${ends}.` : ''}`,
    },
    whitelisted_can_deposit: {
      tone: 'go',
      icon: '★',
      title: `Whitelisted for round ${rid}`,
      sub: currentRoundFull
        ? `You made the whitelist, but the round cap is already reached.`
        : `You can still commit${currentRoundWalletCapInj ? ` up to ${inj(currentRoundWalletCapInj)}` : ''}. ${ends ? `Round ${ends}.` : ''}`,
    },
    whitelisted_upcoming: {
      tone: 'go',
      icon: '★',
      title: `Whitelisted for round ${rid}`,
      sub: `You’re on the whitelist for the upcoming round${starts ? `, which opens ${starts}` : ''}${currentRoundWalletCapInj ? ` (cap ${inj(currentRoundWalletCapInj)})` : ''}. The list can still change until it opens.`,
    },
    not_whitelisted_upcoming: {
      tone: 'idle',
      icon: '○',
      title: `Not whitelisted yet for round ${rid}`,
      sub: `The upcoming round${starts ? ` opens ${starts}` : ''} and its whitelist is still being finalised on chain — check again closer to the start.`,
    },
    not_whitelisted: {
      tone: 'no',
      icon: '—',
      title: `Not whitelisted for round ${rid}`,
      sub: `This wallet is not on the whitelist for the open round.${currentRoundEndDate ? ` Open until ${shortDate(currentRoundEndDate)}.` : ''}`,
    },
    no_open_round: {
      tone: 'idle',
      icon: '○',
      title: 'No round open right now',
      sub: currentRoundId
        ? `The most recent round was #${currentRoundId} (ended ${currentRoundEndDate ? shortDate(currentRoundEndDate) : '—'}). Check back when the next monthly round opens.`
        : 'No buyback rounds found on chain yet.',
    },
    unknown: {
      tone: 'idle',
      icon: '?',
      title: 'Current-round status unavailable',
      sub: 'Could not read the open round from chain. Try again shortly.',
    },
  };

  const s = map[currentStatus];
  return (
    <div className={`tx-bb-status tx-bb-status--${s.tone}`}>
      <span className="tx-bb-status-icon">{s.icon}</span>
      <div className="tx-bb-status-text">
        <span className="tx-bb-status-title">{s.title}</span>
        <span className="tx-bb-status-sub">{s.sub}</span>
      </div>
    </div>
  );
}

function RoundRow({ p }: { p: RoundParticipation }) {
  return (
    <li className="tx-pnl-row">
      <div className="tx-pnl-row-left">
        <div className="tx-pnl-row-main">
          <span className="tx-pnl-ticker">Round {p.roundId}</span>
          {p.committed ? (
            p.hasWithdrawn
              ? <span className="tx-bb-tag tx-bb-tag--claimed">claimed</span>
              : <span className="tx-bb-tag tx-bb-tag--unclaimed">unclaimed</span>
          ) : (
            <span className="tx-bb-tag tx-bb-tag--skipped">whitelisted · didn’t commit</span>
          )}
        </div>
        <span className="tx-pnl-row-meta">
          {shortDate(p.endDate)}
          {p.committed && ` · rewards: ${basketLabel(p)}`}
        </span>
      </div>
      <div className="tx-pnl-row-right">
        {p.committed ? inj(p.depositInj) : '—'}
        <span className="tx-pnl-row-right-sub">
          {p.committed
            ? (p.basketKnownUsd > 0
                ? `${plainUsd(p.basketKnownUsd)}${p.basketHasUnpriced ? '+' : ''} earned`
                : (p.basketHasUnpriced ? 'rewards unpriced' : 'committed'))
            : 'no deposit'}
        </span>
      </div>
    </li>
  );
}

type SigTone = 'go' | 'ok' | 'warn' | 'idle';

function num(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 });
}

function SignalRow({ tone, label, value, note }: { tone: SigTone; label: string; value: string; note: string }) {
  return (
    <li className="tx-pnl-row">
      <div className="tx-pnl-row-left">
        <div className="tx-pnl-row-main">
          <span className={`tx-bb-sig-dot tx-bb-sig-dot--${tone}`} />
          <span className="tx-pnl-ticker">{label}</span>
        </div>
        <span className="tx-pnl-row-meta">{note}</span>
      </div>
      <div className="tx-pnl-row-right">{value}</div>
    </li>
  );
}

/** Honest "where do I stand" panel — real signals, no fabricated probability. */
function SignalsCard({ s }: { s: EligibilitySignals }) {
  const hasHistory = s.recentWindow > 0;
  const rate = hasHistory ? Math.round((s.recentHits / s.recentWindow) * 100) : null;

  const partTone: SigTone = !hasHistory ? 'idle' : s.recentHits >= 2 ? 'go' : 'warn';
  const partValue = hasHistory ? `${s.recentHits} / ${s.recentWindow}` : 'New';
  const partNote = hasHistory
    ? `Whitelisted in ${s.recentHits} of the last ${s.recentWindow} rounds${s.whitelistedLastRound ? ' — including the most recent' : ''}`
    : 'No prior whitelist on record yet';

  const stakeTone: SigTone = s.stakedInj >= 1 ? 'go' : 'warn';
  const actTone: SigTone = s.txCount >= 100 ? 'go' : s.txCount >= 20 ? 'ok' : 'idle';

  return (
    <div className="tx-pnl-card">
      <div className="tx-pnl-head">
        <span className="tx-pnl-head-title">Whitelist signals</span>
        {rate !== null && <span className="tx-pnl-row-meta">{rate}% selection rate</span>}
      </div>

      {rate !== null && (
        <div className="tx-bb-rate">
          <span className="tx-bb-rate-value">{s.recentHits}<span className="tx-bb-rate-sep">/</span>{s.recentWindow}</span>
          <span className="tx-bb-rate-label">
            rounds whitelisted since you first joined — your measured selection rate ({rate}%)
          </span>
        </div>
      )}

      <ul className="tx-pnl-list">
        <SignalRow
          tone={partTone}
          label="Repeat participant"
          value={partValue}
          note={partNote}
        />
        <SignalRow
          tone={stakeTone}
          label="Active staker"
          value={s.stakedInj >= 1 ? `${num(s.stakedInj)} INJ` : 'None'}
          note={s.stakedInj >= 1 ? 'Staked INJ — selection favours active stakers' : 'No active delegation detected'}
        />
        <SignalRow
          tone={actTone}
          label="On-chain activity"
          value={`${s.txCount.toLocaleString()} txs`}
          note={`${s.denomCount} token${s.denomCount === 1 ? '' : 's'} held · ${num(s.liquidInj)} INJ liquid`}
        />
      </ul>

      <div className="tx-pnl-note">
        <span>ℹ</span>
        <span>
          These are favourable signals, not a prediction. The whitelist is compiled off-chain by the team with
          a randomized element, so no honest per-wallet percentage exists — your own track record above is the
          best guide.
        </span>
      </div>
    </div>
  );
}

export default function BuybackDashboard({ profile }: Props) {
  const [showAll, setShowAll] = useState(false);
  const {
    roundsWhitelisted, roundsCommitted, totalRounds,
    totalDepositedInj, totalDepositedUsd, totalRewardsKnownUsd, rewardsHaveUnpriced,
    unclaimedRounds, participations, partial,
  } = profile;

  const everParticipated = roundsWhitelisted > 0;
  const visible = showAll ? participations : participations.slice(0, 6);

  return (
    <div className="tx-pnl-wrap">
      <StatusBanner profile={profile} />

      {/* ── Whitelist signals (honest "where do I stand") ── */}
      <SignalsCard s={profile.signals} />

      {/* ── Lifetime summary ── */}
      <div className="tx-pnl-card">
        <div className="tx-pnl-head">
          <span className="tx-pnl-head-title">Community BuyBack · lifetime</span>
          <span className="tx-pnl-row-meta">{totalRounds} round{totalRounds === 1 ? '' : 's'} on chain</span>
        </div>

        {!everParticipated ? (
          <div className="tx-pnl-empty">
            This wallet has never been whitelisted for a Community BuyBack round. Eligibility favours active
            stakers and on-chain participants — round results are also visible on injhub.com/community-buyback.
          </div>
        ) : (
          <div className="tx-pnl-grid">
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">Rounds whitelisted</span>
              <span className="tx-pnl-stat-value">{roundsWhitelisted}</span>
            </div>
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">Rounds committed</span>
              <span className="tx-pnl-stat-value">{roundsCommitted}</span>
            </div>
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">Total committed</span>
              <span className="tx-pnl-stat-value">{inj(totalDepositedInj)}</span>
            </div>
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">≈ USD in</span>
              <span className="tx-pnl-stat-value">{totalDepositedUsd === null ? '—' : plainUsd(totalDepositedUsd)}</span>
            </div>
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">Rewards (priced)</span>
              <span className="tx-pnl-stat-value tx-pnl-up">
                {totalRewardsKnownUsd > 0 ? `${plainUsd(totalRewardsKnownUsd)}${rewardsHaveUnpriced ? '+' : ''}` : '—'}
              </span>
            </div>
            <div className="tx-pnl-stat">
              <span className="tx-pnl-stat-label">Unclaimed</span>
              <span className={`tx-pnl-stat-value${unclaimedRounds > 0 ? ' tx-pnl-down' : ''}`}>{unclaimedRounds}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Per-round history ── */}
      {participations.length > 0 && (
        <div className="tx-pnl-card">
          <div className="tx-pnl-head">
            <span className="tx-pnl-head-title">Round history</span>
          </div>
          <ul className="tx-pnl-list">
            {visible.map(p => <RoundRow key={p.roundId} p={p} />)}
          </ul>
          {participations.length > 6 && (
            <button className="tx-pnl-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : `Show all ${participations.length} rounds`}
            </button>
          )}
        </div>
      )}

      {/* ── Caveats ── */}
      {rewardsHaveUnpriced && everParticipated && (
        <div className="tx-pnl-note">
          <span>⚠</span>
          <span>
            Reward baskets include ecosystem tokens with no market price feed — the USD figures cover only the
            priced portion (stablecoins, majors) and a “+” marks rounds with additional unpriced tokens.
          </span>
        </div>
      )}
      {partial && (
        <div className="tx-pnl-note">
          <span>⚠</span>
          <span>
            One or more round lookups didn’t resolve, so this view may be incomplete. Refresh to retry.
          </span>
        </div>
      )}
    </div>
  );
}
