import { Wallet } from 'xrpl';

/**
 * Get the backend wallet from environment seed
 */
export function getBackendWallet(): Wallet {
  const seed = process.env.BACKEND_WALLET_SEED;
  if (!seed) {
    throw new Error('BACKEND_WALLET_SEED not configured');
  }
  return Wallet.fromSeed(seed);
}

/**
 * Get the issuer wallet from environment seed
 */
export function getIssuerWallet(): Wallet {
  const seed = process.env.ISSUER_WALLET_SEED;
  if (!seed) {
    throw new Error('ISSUER_WALLET_SEED not configured');
  }
  return Wallet.fromSeed(seed);
}

/**
 * Get the issuer address from environment
 */
export function getIssuerAddress(): string {
  const address = process.env.ISSUER_ADDRESS;
  if (!address) {
    throw new Error('ISSUER_ADDRESS not configured');
  }
  return address;
}

/**
 * Get the backend wallet address from environment
 */
export function getBackendAddress(): string {
  const address = process.env.BACKEND_ADDRESS;
  if (!address) {
    // Derive from seed if address not set directly
    const wallet = getBackendWallet();
    return wallet.address;
  }
  return address;
}

export function getLoanBrokerWallet(): Wallet {
  const seed = process.env.LOAN_BROKER_SEED || process.env.BACKEND_WALLET_SEED;
  if (!seed) {
    throw new Error('LOAN_BROKER_SEED or BACKEND_WALLET_SEED not configured');
  }

  return Wallet.fromSeed(seed);
}

export function getLoanBrokerAddress(): string {
  const address = process.env.LOAN_BROKER_ADDRESS;
  if (address) {
    return address;
  }

  return getLoanBrokerWallet().address;
}

export function getLoanBrokerId(): string {
  const brokerId = process.env.LOAN_BROKER_ID;
  if (!brokerId) {
    throw new Error('LOAN_BROKER_ID not configured');
  }

  return brokerId;
}
