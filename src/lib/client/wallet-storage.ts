export const LOCAL_WALLET_SEED_KEY = 'xrpl.dev.wallet.seed';
export const WALLET_CONNECTION_KEY = 'xrpl.wallet.connection';
export const WALLET_TRUSTLINES_CACHE_KEY = 'xrpl.wallet.trustlines.cache';

export interface WalletTrustLineFlags {
  RLUSD: boolean;
  SAIL: boolean;
  NYRA: boolean;
}

interface TrustLineCacheRecord {
  updatedAt: number;
  flags: WalletTrustLineFlags;
}

type TrustLineCacheMap = Record<string, TrustLineCacheRecord>;

type WalletConnectionType = 'local';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function notifyWalletStorageChanged(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event('xrpl-wallet-storage-changed'));
}

function makeTrustLineCacheKey(address: string, issuerAddress: string): string {
  return `${address.trim().toUpperCase()}::${issuerAddress.trim().toUpperCase()}`;
}

function readTrustLineCacheMap(): TrustLineCacheMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(WALLET_TRUSTLINES_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TrustLineCacheMap;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeTrustLineCacheMap(map: TrustLineCacheMap): void {
  if (!isBrowser()) return;
  localStorage.setItem(WALLET_TRUSTLINES_CACHE_KEY, JSON.stringify(map));
  notifyWalletStorageChanged();
}

export function saveWalletSeed(seed: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(LOCAL_WALLET_SEED_KEY, seed);
  notifyWalletStorageChanged();
}

export function loadWalletSeed(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(LOCAL_WALLET_SEED_KEY);
}

export function clearWalletSeed(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(LOCAL_WALLET_SEED_KEY);
  notifyWalletStorageChanged();
}

export function saveWalletConnection(type: WalletConnectionType): void {
  if (!isBrowser()) return;
  localStorage.setItem(WALLET_CONNECTION_KEY, type);
  notifyWalletStorageChanged();
}

export function loadWalletConnection(): WalletConnectionType | null {
  if (!isBrowser()) return null;
  const value = localStorage.getItem(WALLET_CONNECTION_KEY);
  if (value === 'local') {
    return value;
  }
  return null;
}

export function clearWalletConnection(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(WALLET_CONNECTION_KEY);
  notifyWalletStorageChanged();
}

export function saveWalletTrustLineFlags(
  address: string,
  issuerAddress: string,
  flags: WalletTrustLineFlags
): void {
  if (!isBrowser()) return;
  const cacheKey = makeTrustLineCacheKey(address, issuerAddress);
  const map = readTrustLineCacheMap();
  map[cacheKey] = {
    updatedAt: Date.now(),
    flags,
  };
  writeTrustLineCacheMap(map);
}

export function loadWalletTrustLineFlags(
  address: string,
  issuerAddress: string
): WalletTrustLineFlags | null {
  if (!isBrowser()) return null;
  const cacheKey = makeTrustLineCacheKey(address, issuerAddress);
  const map = readTrustLineCacheMap();
  return map[cacheKey]?.flags ?? null;
}
