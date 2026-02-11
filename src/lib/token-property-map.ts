export interface TokenPropertyLink {
  token: string;
  propertyName: string;
  propertyPath: string;
}

const TOKEN_PROPERTY_LINKS: Record<string, TokenPropertyLink> = {
  SAIL: {
    token: 'SAIL',
    propertyName: 'THE SAIL Hotel Tower',
    propertyPath: '/hotel/the-sail',
  },
  NYRA: {
    token: 'NYRA',
    propertyName: 'NYRA Oceanview Hotel',
    propertyPath: '/hotel/nyra',
  },
};

export function getTokenPropertyLink(token: string): TokenPropertyLink | null {
  return TOKEN_PROPERTY_LINKS[token.toUpperCase()] ?? null;
}
