import { Copy, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface AdminMarket {
  id: string;
  name: string;
  isActive: boolean;
  collateralCurrency: string;
  collateralIssuer: string;
  debtCurrency: string;
  debtIssuer: string;
  supplyVaultId: string | null;
  supplyMptIssuanceId: string | null;
  loanBrokerId: string | null;
  loanBrokerAddress: string | null;
  vaultScale: number;
  totalSupplied: number;
  totalBorrowed: number;
  vaultStatus: 'configured' | 'missing' | 'error';
  vaultError?: string;
  vaultInfo?: {
    assetsTotal: string;
    assetsAvailable: string;
  };
}

interface MarketVaultManagementCardProps {
  markets: AdminMarket[];
  selectedMarketId: string | null;
  manualVaultId: string;
  manualMptIssuanceId: string;
  loading: string;
  onRefresh: () => void;
  onSelectMarket: (market: AdminMarket) => void;
  onDeselectMarket: () => void;
  onSetManualVaultId: (value: string) => void;
  onSetManualMptIssuanceId: (value: string) => void;
  onCreateVault: (marketId: string) => void;
  onToggleStatus: (marketId: string, currentStatus: boolean) => void;
  onSwapVault: (marketId: string) => void;
  onCopyText: (value: string, label: string) => void;
}

function truncate(value: string | null, max: number = 16) {
  if (!value) return 'Not configured';
  if (value.length <= max) return value;
  const left = Math.floor((max - 3) / 2);
  const right = Math.ceil((max - 3) / 2);
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export function MarketVaultManagementCard({
  markets,
  selectedMarketId,
  manualVaultId,
  manualMptIssuanceId,
  loading,
  onRefresh,
  onSelectMarket,
  onDeselectMarket,
  onSetManualVaultId,
  onSetManualMptIssuanceId,
  onCreateVault,
  onToggleStatus,
  onSwapVault,
  onCopyText,
}: MarketVaultManagementCardProps) {
  const selectedMarket = markets.find((market) => market.id === selectedMarketId) ?? null;

  return (
    <Card className="border-zinc-800 bg-zinc-900/40 text-zinc-100">
      <CardHeader>
        <CardTitle className="text-base">Market & Vault Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">Manage active and inactive market vault mappings from admin UI.</p>
          <Button variant="outline" onClick={onRefresh} disabled={loading === 'refresh-markets'}>
            {loading === 'refresh-markets' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr_1.4fr_1.5fr] gap-3 bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <span>Market</span>
            <span>Status</span>
            <span>Vault</span>
            <span>Vault ID</span>
            <span>Actions</span>
          </div>

          {markets.length === 0 ? (
            <div className="px-3 py-5 text-sm text-zinc-400">No markets found.</div>
          ) : (
            <div>
              {markets.map((market) => {
                const isSelected = selectedMarketId === market.id;
                const createLoading = loading === `create-vault-${market.id}`;
                const statusLoading = loading === `toggle-status-${market.id}`;

                return (
                  <div key={market.id} className="border-t border-zinc-800">
                    <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr_1.4fr_1.5fr] items-center gap-3 px-3 py-3 text-sm text-zinc-200">
                      <button
                        className="text-left font-medium underline-offset-2 hover:underline"
                        onClick={() => {
                          if (isSelected) {
                            onDeselectMarket();
                            return;
                          }
                          onSelectMarket(market);
                        }}
                      >
                        {market.name}
                      </button>
                      <span>
                        <Badge variant={market.isActive ? 'default' : 'secondary'}>
                          {market.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </span>
                      <span>
                        <Badge
                          variant={
                            market.vaultStatus === 'configured'
                              ? 'default'
                              : market.vaultStatus === 'error'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {market.vaultStatus === 'configured'
                            ? 'Configured'
                            : market.vaultStatus === 'error'
                              ? 'Error'
                              : 'Missing'}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-2 font-mono text-xs">
                        {truncate(market.supplyVaultId)}
                        {market.supplyVaultId ? (
                          <button
                            onClick={() => onCopyText(market.supplyVaultId as string, 'Vault ID')}
                            className="text-zinc-500 hover:text-zinc-200"
                            aria-label={`Copy vault id for ${market.name}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => onCreateVault(market.id)} disabled={createLoading}>
                          {createLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                          Create Vault
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onToggleStatus(market.id, market.isActive)}
                          disabled={statusLoading}
                        >
                          {statusLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                          {market.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedMarket ? (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-100">{selectedMarket.name} details</p>
              <p className="text-xs font-mono text-zinc-400">
                Vault ID: {selectedMarket.supplyVaultId ?? 'Not configured'}
              </p>
              <p className="text-xs font-mono text-zinc-400">
                MPT Issuance ID: {selectedMarket.supplyMptIssuanceId ?? 'Not configured'}
              </p>
            </div>

            {selectedMarket.vaultInfo ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-xs text-zinc-400">assetsTotal</p>
                  <p className="text-sm font-semibold text-zinc-100">{selectedMarket.vaultInfo.assetsTotal}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-xs text-zinc-400">assetsAvailable</p>
                  <p className="text-sm font-semibold text-zinc-100">{selectedMarket.vaultInfo.assetsAvailable}</p>
                </div>
              </div>
            ) : null}

            {selectedMarket.vaultError ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {selectedMarket.vaultError}
              </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-zinc-300">Vault ID</label>
                <input
                  type="text"
                  value={manualVaultId}
                  onChange={(event) => onSetManualVaultId(event.target.value)}
                  placeholder="000..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-300">MPT Issuance ID</label>
                <input
                  type="text"
                  value={manualMptIssuanceId}
                  onChange={(event) => onSetManualMptIssuanceId(event.target.value)}
                  placeholder="000..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>

            <Button onClick={() => onSwapVault(selectedMarket.id)} disabled={loading === `swap-vault-${selectedMarket.id}`}>
              {loading === `swap-vault-${selectedMarket.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Swap Vault
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
