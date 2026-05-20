'use client';

import { useEffect, useMemo, useState } from 'react';
import { Connection, clusterApiUrl, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

interface SolanaProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

interface VerifiedRecord {
  id: string;
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  venue: string;
  referee: string;
  rating: number;
  signature: string;
  submitter: string;
  completedAt: string;
  memoData: string;
  proofHash: string;
}

interface TeamStat {
  team: string;
  verifiedMatches: number;
  reputation: number;
  points: number;
  averageRating: number;
}

const STORAGE_KEY = 'verifiedMatchRecords';

const formatScoreDisplay = (homeScore: number, awayScore: number) => {
  return `${homeScore} - ${awayScore}`;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return (
    '{' +
    keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(',') +
    '}'
  );
};

const generateProofHash = async (payload: string) => {
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(digest).slice(0, 16);
};

const createMemoPayload = async (params: {
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  venue: string;
  referee: string;
  rating: number;
  submitter: string;
}) => {
  const basePayload = {
    competition: params.competition,
    date: params.date,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    venue: params.venue,
    rating: params.rating,
    referee: params.referee,
    submitter: params.submitter,
    submittedAt: new Date().toISOString(),
    type: 'verified-match'
  };

  const canonicalBase = stableStringify(basePayload);
  const proofHash = await generateProofHash(canonicalBase);
  const memoData = stableStringify({ ...basePayload, proofHash });

  return { memoData, proofHash };
};

export default function HomePage() {
  const [records, setRecords] = useState<VerifiedRecord[]>([]);
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [venue, setVenue] = useState('');
  const [competition, setCompetition] = useState('Grassroots Cup');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [referee, setReferee] = useState('Referee Name');
  const [rating, setRating] = useState(8);
  const [status, setStatus] = useState('Ready to verify');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const connection = useMemo(() => new Connection(clusterApiUrl('devnet'), 'confirmed'), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRecords(JSON.parse(stored));
      } catch {
        setRecords([]);
      }
    }
    const savedWallet = window.localStorage.getItem('verifiedLedgerWallet');
    if (savedWallet) setWalletAddress(savedWallet);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const teamStats = useMemo(() => {
    const map = new Map<string, { verifiedMatches: number; points: number; ratingSum: number; ratingCount: number }>();
    records.forEach((record) => {
      const home = record.homeScore;
      const away = record.awayScore;
      const teamA = record.homeTeam;
      const teamB = record.awayTeam;
      const homePoints = home > away ? 3 : home === away ? 1 : 0;
      const awayPoints = away > home ? 3 : home === away ? 1 : 0;

      const update = (team: string, points: number) => {
        const current = map.get(team) ?? { verifiedMatches: 0, points: 0, ratingSum: 0, ratingCount: 0 };
        current.verifiedMatches += 1;
        current.points += points;
        current.ratingSum += record.rating;
        current.ratingCount += 1;
        map.set(team, current);
      };

      update(teamA, homePoints);
      update(teamB, awayPoints);
    });

    return Array.from(map.entries())
      .map(([team, stats]) => ({
        team,
        verifiedMatches: stats.verifiedMatches,
        points: stats.points,
        reputation: Math.round((stats.points + stats.ratingSum / Math.max(stats.ratingCount, 1)) * 10) / 10,
        averageRating: Math.round((stats.ratingSum / Math.max(stats.ratingCount, 1)) * 10) / 10
      }))
      .sort((a, b) => b.reputation - a.reputation || b.points - a.points || b.verifiedMatches - a.verifiedMatches);
  }, [records]);

  const connectWallet = async () => {
    if (typeof window === 'undefined') return;
    if (!window.solana || !window.solana.isPhantom) {
      setError('Phantom wallet is required for verification.');
      return;
    }

    try {
      const response = await window.solana.connect();
      setWalletAddress(response.publicKey.toString());
      window.localStorage.setItem('verifiedLedgerWallet', response.publicKey.toString());
      setError(null);
      setStatus('Wallet connected. Ready to verify.');
    } catch (err) {
      setError('Wallet connection was cancelled.');
      setStatus('Ready to verify');
    }
  };

  const verifyMatch = async () => {
    setError(null);
    setStatus('Connecting wallet...');
    if (typeof window === 'undefined' || !window.solana || !window.solana.isPhantom) {
      setError('Phantom wallet is not available in this browser.');
      setStatus('Ready to verify');
      return;
    }

    try {
      const provider = window.solana;
      if (!provider.isConnected) {
        await provider.connect();
      }

      const publicKey = provider.publicKey;
      if (!publicKey) throw new Error('Wallet public key not available.');
      setWalletAddress(publicKey.toString());
      window.localStorage.setItem('verifiedLedgerWallet', publicKey.toString());

      setStatus('Preparing verification record...');
      const { memoData, proofHash } = await createMemoPayload({
        date,
        competition,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        venue,
        referee,
        rating,
        submitter: publicKey.toString()
      });

      const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      const instruction = new TransactionInstruction({
        keys: [],
        programId: memoProgramId,
        data: Buffer.from(memoData, 'utf8')
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash;

      setStatus('Sending transaction to Solana Devnet...');
      let signature: string;

      if (provider.signAndSendTransaction) {
        const response = await provider.signAndSendTransaction(transaction);
        signature = response.signature;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error('Wallet cannot sign transactions.');
      }

      await connection.confirmTransaction(signature, 'confirmed');

      const newRecord: VerifiedRecord = {
        id: signature,
        date,
        competition,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        venue,
        referee,
        rating,
        signature,
        submitter: publicKey.toString(),
        completedAt: new Date().toISOString(),
        memoData,
        proofHash
      };

      setRecords((current) => [newRecord, ...current]);
      setStatus('Match verified successfully.');
    } catch (err) {
      setError((err as Error)?.message ?? 'Verification failed.');
      setStatus('Ready to verify');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Verified Match Ledger</p>
          <h1>Grassroots football reputation on Solana Devnet</h1>
          <p className="lead">
            Capture verified match results and let teams build a reputation with on-chain proof.
            A clean football experience hides the Solana proof inside an expandable section.
          </p>
        </div>
        <div className="hero-actions">
          <div className="wallet-card">
            <p>Wallet</p>
            <strong>{walletAddress ?? 'Not connected'}</strong>
            <button className="button" onClick={connectWallet}>
              {walletAddress ? 'Reconnect Phantom' : 'Connect Phantom'}
            </button>
          </div>
          <div className="status-card">
            <p>Status</p>
            <strong>{status}</strong>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="form-card">
          <h2>Verify a match</h2>
          <div className="field-row">
            <label>Home team</label>
            <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Team A" />
          </div>
          <div className="field-row">
            <label>Away team</label>
            <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Team B" />
          </div>
          <div className="field-row split">
            <div>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label>Venue</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Stadium Name" />
            </div>
          </div>
          <div className="field-row split">
            <div>
              <label>Home score</label>
              <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(Number(e.target.value))} />
            </div>
            <div>
              <label>Away score</label>
              <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(Number(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <label>Competition</label>
            <input value={competition} onChange={(e) => setCompetition(e.target.value)} />
          </div>
          <div className="field-row split">
            <div>
              <label>Referee</label>
              <input value={referee} onChange={(e) => setReferee(e.target.value)} />
            </div>
            <div>
              <label>Match rating</label>
              <input type="number" min="1" max="10" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
            </div>
          </div>
          <button className="button primary" onClick={verifyMatch}>Publish verification</button>
          <p className="hint">
            Transactions are sent to Solana Devnet using the Memo Program. Proof details are hidden behind the verification card.
          </p>
        </div>

        <div className="stats-card">
          <h2>Team reputation</h2>
          {teamStats.length === 0 ? (
            <p className="empty-state">No verified matches yet. Add a record to begin reputation tracking.</p>
          ) : (
            <div className="stats-table">
              <div className="stats-row header">
                <span>Team</span>
                <span>Rep</span>
                <span>Pts</span>
                <span>Matches</span>
              </div>
              {teamStats.map((team) => (
                <div className="stats-row" key={team.team}>
                  <strong>{team.team}</strong>
                  <span>{team.reputation}</span>
                  <span>{team.points}</span>
                  <span>{team.verifiedMatches}</span>
                </div>
              ))}
            </div>
          )}
          <div className="callout">
            <strong>Devnet note:</strong> Your wallet must be connected and funded with Devnet SOL to sign a verification transaction.
          </div>
        </div>
      </section>

      <section className="records-card">
        <div className="section-header">
          <h2>Verified match records</h2>
          <p>Each record includes a Solana Memo transaction that proves it was anchored on-chain.</p>
        </div>

        {records.length === 0 ? (
          <p className="empty-state">No verified match records yet. Use the form above to add one.</p>
        ) : (
          records.map((record) => (
            <article className="record" key={record.id}>
              <div className="record-summary">
                <div>
                  <p className="record-title">{record.homeTeam} {formatScoreDisplay(record.homeScore, record.awayScore)} {record.awayTeam}</p>
                  <p className="record-meta">{record.date} · {record.competition} · Venue: {record.venue || 'N/A'} · Referee: {record.referee}</p>
                </div>
                <button className="link-button" onClick={() => toggleExpand(record.id)}>
                  {expandedIds.includes(record.id) ? 'Hide verification proof' : 'Show verification proof'}
                </button>
              </div>

              {expandedIds.includes(record.id) ? (
                <div className="proof-panel">
                  <div className="proof-row"><strong>Transaction signature</strong><span>{record.signature}</span></div>
                  <div className="proof-row"><strong>Proof hash</strong><span>{record.proofHash}</span></div>
                  <div className="proof-row"><strong>Submitter</strong><span>{record.submitter}</span></div>
                  <div className="proof-row"><strong>Recorded</strong><span>{record.completedAt}</span></div>
                  <div className="proof-row proof-data">
                    <strong>Memo payload</strong>
                    <pre>{record.memoData}</pre>
                  </div>
                  <a className="explorer-link" href={`https://explorer.solana.com/tx/${record.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
                    View on Solana Devnet Explorer
                  </a>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
