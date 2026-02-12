type CacheEntry = {
  value: unknown;
  expiresAt: number;
  staleUntil: number | null;
  tags: string[];
};

type CacheStore = {
  entries: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  tagToKeys: Map<string, Set<string>>;
};

type CacheOptions<T> = {
  key: string;
  ttlMs: number;
  staleTtlMs?: number;
  tags?: string[];
  loader: () => Promise<T>;
};

type LendingCacheInvalidationArgs = {
  marketId?: string;
  userAddress?: string;
  loanId?: string;
  vaultId?: string;
};

const CACHE_ENABLED = parseBooleanEnv(process.env.XRPL_CACHE_ENABLED, false);
const CACHE_BYPASS = parseBooleanEnv(process.env.XRPL_CACHE_BYPASS, false);
const CACHE_SCOPE = process.env.NEXT_PUBLIC_XRPL_WS_URL || 'devnet';

declare global {
  var __laplaceXrplCacheStore: CacheStore | undefined;
}

const store =
  globalThis.__laplaceXrplCacheStore ??
  (globalThis.__laplaceXrplCacheStore = {
    entries: new Map<string, CacheEntry>(),
    inflight: new Map<string, Promise<unknown>>(),
    tagToKeys: new Map<string, Set<string>>(),
  });

function parseBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function isCacheActive(): boolean {
  return CACHE_ENABLED && !CACHE_BYPASS;
}

function indexTags(key: string, tags: string[]): void {
  for (const tag of tags) {
    const set = store.tagToKeys.get(tag) ?? new Set<string>();
    set.add(key);
    store.tagToKeys.set(tag, set);
  }
}

function removeTagIndexes(key: string, tags: string[]): void {
  for (const tag of tags) {
    const set = store.tagToKeys.get(tag);
    if (!set) continue;
    set.delete(key);
    if (set.size === 0) {
      store.tagToKeys.delete(tag);
    }
  }
}

function setEntry(key: string, value: unknown, ttlMs: number, staleTtlMs?: number, tags?: string[]): void {
  const now = Date.now();
  const tagList = Array.isArray(tags) ? [...new Set(tags)] : [];
  const staleUntil = staleTtlMs && staleTtlMs > 0 ? now + ttlMs + staleTtlMs : null;

  const existing = store.entries.get(key);
  if (existing) {
    removeTagIndexes(key, existing.tags);
  }

  store.entries.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleUntil,
    tags: tagList,
  });
  indexTags(key, tagList);
}

function deleteEntry(key: string): void {
  const entry = store.entries.get(key);
  if (!entry) return;

  removeTagIndexes(key, entry.tags);
  store.entries.delete(key);
  store.inflight.delete(key);
}

function getFreshEntry<T>(key: string): T | null {
  const entry = store.entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value as T;
}

function getStaleEntry<T>(key: string): T | null {
  const entry = store.entries.get(key);
  if (!entry || entry.staleUntil === null) return null;
  const now = Date.now();
  if (entry.expiresAt > now) return null;
  if (entry.staleUntil <= now) {
    deleteEntry(key);
    return null;
  }
  return entry.value as T;
}

async function refreshEntry<T>(opts: CacheOptions<T>): Promise<T> {
  const cachedInflight = store.inflight.get(opts.key);
  if (cachedInflight) {
    return cachedInflight as Promise<T>;
  }

  const loadPromise = opts
    .loader()
    .then((value) => {
      setEntry(opts.key, value, opts.ttlMs, opts.staleTtlMs, opts.tags);
      return value;
    })
    .finally(() => {
      store.inflight.delete(opts.key);
    });

  store.inflight.set(opts.key, loadPromise);
  return loadPromise;
}

export async function cached<T>(opts: CacheOptions<T>): Promise<T> {
  if (!isCacheActive()) {
    return opts.loader();
  }

  const fresh = getFreshEntry<T>(opts.key);
  if (fresh !== null) {
    return fresh;
  }

  const stale = getStaleEntry<T>(opts.key);
  if (stale !== null) {
    void refreshEntry(opts).catch(() => {
      return;
    });
    return stale;
  }

  return refreshEntry(opts);
}

export function invalidateByTag(tag: string): void {
  const keys = store.tagToKeys.get(tag);
  if (!keys) return;

  for (const key of keys) {
    deleteEntry(key);
  }
  store.tagToKeys.delete(tag);
}

export function invalidateByPrefix(prefix: string): void {
  const keys = [...store.entries.keys()];
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      deleteEntry(key);
    }
  }
}

export function invalidateLendingReadCaches(args: LendingCacheInvalidationArgs): void {
  if (args.marketId) {
    invalidateByPrefix(`pool:${args.marketId}:`);
    invalidateByPrefix(`prices:${args.marketId}:`);
    if (args.userAddress) {
      invalidateByPrefix(`position:${args.marketId}:${args.userAddress}:`);
    }
  }

  if (args.loanId) {
    deleteEntry(xrplCacheKeys.loanInfo(args.loanId));
  }

  if (args.vaultId) {
    deleteEntry(xrplCacheKeys.supplyVaultInfo(args.vaultId));
  }

  if (!args.loanId && !args.vaultId) {
    invalidateByPrefix('loan-info:');
    invalidateByPrefix('vault-info:');
  }
}

export function cacheSize(): number {
  return store.entries.size;
}

export const xrplCacheKeys = {
  vaultSupport: () => `vault-support:${CACHE_SCOPE}`,
  supplyVaultInfo: (vaultId: string) => `vault-info:${CACHE_SCOPE}:${vaultId}`,
  loanSupport: () => `loan-support:${CACHE_SCOPE}`,
  loanInfo: (loanId: string) => `loan-info:${CACHE_SCOPE}:${loanId}`,
  issuerEscrowSupport: (issuer: string) => `issuer-escrow-support:${CACHE_SCOPE}:${issuer}`,
};
