export const TOKEN_CODE_BY_SYMBOL = {
  SAIL: '5341494C00000000000000000000000000000000',
  NYRA: '4E59524100000000000000000000000000000000',
  RLUSD: '524C555344000000000000000000000000000000',
} as const;

export type SupportedTokenSymbol = keyof typeof TOKEN_CODE_BY_SYMBOL;

export function getTokenCode(symbol: string): string | null {
  const normalized = symbol.toUpperCase() as SupportedTokenSymbol;
  return TOKEN_CODE_BY_SYMBOL[normalized] ?? null;
}

export function getTokenSymbol(currency: string): string {
  const normalized = currency.toUpperCase();
  for (const [symbol, code] of Object.entries(TOKEN_CODE_BY_SYMBOL)) {
    if (normalized === code || normalized === symbol) {
      return symbol;
    }
  }

  return currency;
}
