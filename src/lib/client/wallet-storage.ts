export const LOCAL_WALLET_SEED_KEY = 'xrpl.dev.wallet.seed';

export function saveWalletSeed(seed: string): void {
  localStorage.setItem(LOCAL_WALLET_SEED_KEY, seed);
}

export function loadWalletSeed(): string | null {
  return localStorage.getItem(LOCAL_WALLET_SEED_KEY);
}

export function clearWalletSeed(): void {
  localStorage.removeItem(LOCAL_WALLET_SEED_KEY);
}
