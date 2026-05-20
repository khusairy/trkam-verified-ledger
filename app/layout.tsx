import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verified Ledger',
  description: 'Solana Devnet verified match ledger for grassroots football and futsal.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
