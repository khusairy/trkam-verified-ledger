import { PublicKey, Transaction } from '@solana/web3.js';

declare global {
  interface SolanaProvider {
    isPhantom?: boolean;
    isConnected?: boolean;
    publicKey?: PublicKey;
    connect: () => Promise<{ publicKey: PublicKey }>;
    signTransaction?: (transaction: Transaction) => Promise<Transaction>;
    signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>;
  }

  interface Window {
    solana?: SolanaProvider;
  }
}

export {};
