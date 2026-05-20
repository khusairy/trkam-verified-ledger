# trkam-verified-ledger

## Project overview

`trkam-verified-ledger` is a standalone Next.js + TypeScript proof-of-concept for verified football match records anchored on Solana Devnet. The app lets grassroots teams:

- enter match results and referee data
- generate a compact proof hash for each match
- publish the record as a Solana Devnet transaction using the Memo Program
- display verified match results with an expandable "Verification Proof" panel
- track simple team reputation from verified results

The UI is designed to look like a football match ledger rather than a crypto dashboard. Technical Solana details are hidden behind the expandable proof section.

## How to run locally

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open the app in your browser:

```bash
http://localhost:3000
```

## How Solana verification works

- The app uses `@solana/web3.js` and the Solana Memo Program to create a small on-chain proof.
- When a match is verified, the app builds a JSON memo payload with match details and a SHA-256 proof hash.
- That payload is sent as a Solana Devnet transaction memo from the connected Phantom wallet.
- The memo transaction signature and payload are stored locally and displayed in the verification panel.

This makes each record verifiable on Solana Devnet without exposing the blockchain flow unless the user expands the proof details.

## Demo flow

1. Open the app and connect a Phantom wallet configured for `Devnet`.
2. If needed, fund the wallet with Devnet SOL using a Devnet faucet.
3. Enter home team, away team, score, competition, referee, and rating.
4. Click `Publish verification`.
5. The app sends a Solana Devnet Memo transaction and records the verified match.
6. Expand a record to view the transaction signature, proof hash, submitter address, and memo payload.
7. The right-side panel shows team reputation metrics derived from verified matches.

## Setup notes

- Phantom wallet is required for transaction signing.
- Make sure Phantom is set to the `Devnet` cluster.
- Use a Devnet faucet to obtain test SOL before publishing verification records.
