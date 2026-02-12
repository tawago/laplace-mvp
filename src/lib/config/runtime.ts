export type XrplNetwork = 'testnet' | 'devnet';

const DEFAULTS: Record<XrplNetwork, { wsUrl: string; explorerUrl: string }> = {
  testnet: {
    wsUrl: 'wss://s.altnet.rippletest.net:51233',
    explorerUrl: 'https://testnet.xrpl.org',
  },
  devnet: {
    wsUrl: 'wss://s.devnet.rippletest.net:51233',
    explorerUrl: 'https://devnet.xrpl.org',
  },
};

function isXrplNetwork(value: string): value is XrplNetwork {
  return value === 'testnet' || value === 'devnet';
}

export function getXrplNetwork(): XrplNetwork {
  const rawNetwork = process.env.NEXT_PUBLIC_XRPL_NETWORK;
  if (!rawNetwork) {
    return 'testnet';
  }

  if (!isXrplNetwork(rawNetwork)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_XRPL_NETWORK: "${rawNetwork}". Expected "testnet" or "devnet".`
    );
  }

  return rawNetwork;
}

export function getXrplWsUrl(): string {
  const network = getXrplNetwork();
  return process.env.NEXT_PUBLIC_TESTNET_URL || DEFAULTS[network].wsUrl;
}

export function getXrplExplorerUrl(): string {
  const network = getXrplNetwork();
  return process.env.NEXT_PUBLIC_TESTNET_EXPLORER || DEFAULTS[network].explorerUrl;
}

export function getDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL;
  if (direct) {
    return direct;
  }

  const network = getXrplNetwork();
  throw new Error(
    [
      `Missing database configuration for ${network}.`,
      'Set DATABASE_URL in your network env file:',
      network === 'devnet' ? '- .env.devnet' : '- .env.local',
    ].join('\n')
  );
}
