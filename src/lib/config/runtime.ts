export type XrplNetwork = 'devnet';

const DEVNET_DEFAULTS = {
  wsUrl: 'wss://s.devnet.rippletest.net:51233',
  explorerUrl: 'https://devnet.xrpl.org',
};

export function getXrplNetwork(): XrplNetwork {
  const rawNetwork = process.env.NEXT_PUBLIC_XRPL_NETWORK;
  if (!rawNetwork) {
    return 'devnet';
  }

  if (rawNetwork !== 'devnet') {
    throw new Error(
      `Invalid NEXT_PUBLIC_XRPL_NETWORK: "${rawNetwork}". Expected "devnet".`
    );
  }

  return 'devnet';
}

export function getXrplWsUrl(): string {
  return process.env.NEXT_PUBLIC_XRPL_WS_URL || DEVNET_DEFAULTS.wsUrl;
}

export function getXrplExplorerUrl(): string {
  return process.env.NEXT_PUBLIC_XRPL_EXPLORER_URL || DEVNET_DEFAULTS.explorerUrl;
}

export function getDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL;
  if (direct) {
    return direct;
  }

  throw new Error(
    [
      'Missing database configuration for devnet.',
      'Set DATABASE_URL in .env.local.',
    ].join('\n')
  );
}
