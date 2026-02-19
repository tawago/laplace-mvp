const DEFAULT_LOAN_TERM_MONTHS_FALLBACK = 24;

function parseLoanTermMonths(value: string | undefined): number {
  if (!value) return DEFAULT_LOAN_TERM_MONTHS_FALLBACK;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOAN_TERM_MONTHS_FALLBACK;
  return Math.floor(parsed);
}

export const DEFAULT_LOAN_TERM_MONTHS = parseLoanTermMonths(process.env.LENDING_LOAN_TERM_MONTHS);
