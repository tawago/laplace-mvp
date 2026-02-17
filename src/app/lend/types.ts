export interface MarketConfig {
  id: string;
  name: string;
  collateralCurrency: string;
  debtCurrency: string;
  debtIssuer: string;
  supplyVaultId: string | null;
  supplyMptIssuanceId: string | null;
  vaultScale: number;
  baseInterestRate: number;
  minSupplyAmount: number;
  reserveFactor: number;
}

export interface LendingConfig {
  markets: MarketConfig[];
  issuerAddress: string;
  backendAddress: string;
  explorerUrl: string;
}

export interface PoolMetrics {
  marketId: string;
  totalSupplied: number;
  totalBorrowed: number;
  availableLiquidity: number;
  utilizationRate: number;
  borrowApr: number;
  supplyApr: number;
  supplyApy: number;
  globalYieldIndex: number;
}

export interface SupplyPosition {
  id: string;
  status: 'ACTIVE' | 'CLOSED';
  supplyAmount: number;
  suppliedAt: string;
}

export interface SupplyPositionMetrics {
  accruedYield: number;
  withdrawableAmount: number;
  availableLiquidity: number;
  utilizationRate: number;
  supplyApr: number;
  supplyApy: number;
}

export interface SupplierEvent {
  id: string;
  eventType: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  amount: number | null;
  currency: string | null;
  createdAt: string;
  errorMessage: string | null;
}
