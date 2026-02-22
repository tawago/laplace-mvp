'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  fundWalletFromFaucet,
  generateWallet,
  getWalletFromSeed,
  submitTrustLinesParallelWithIncrementalSequence,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import {
  clearWalletConnection,
  clearWalletSeed,
  loadWalletSeed,
  saveWalletSeed,
} from '@/lib/client/wallet-storage';
import { getTokenCode } from '@/lib/xrpl/currency-codes';
import { useWallet } from '@/contexts/wallet-context';
import { LocalWalletCard } from './components/local-wallet-card';
import { WalletToolsGrid } from './components/wallet-tools-grid';
import { WalletBalancesCard } from './components/wallet-balances-card';
import {
  MarketVaultManagementCard,
  type AdminMarket,
} from './components/market-vault-management-card';

interface LendingConfig {
  issuerAddress: string;
}

const TOKEN_LIST = ['SAIL', 'NYRA', 'RLUSD'] as const;
type TokenCode = (typeof TOKEN_LIST)[number];

export default function AdminPage() {
  const {
    disconnect,
    connectLocalWallet,
    trustLineStatusByToken,
    hasTrustLineByToken,
    refreshTrustLineStatuses,
  } = useWallet();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState<string>('');
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [manualVaultId, setManualVaultId] = useState('');
  const [manualMptIssuanceId, setManualMptIssuanceId] = useState('');
  const [trustlineEstablishing, setTrustlineEstablishing] = useState<Record<TokenCode, boolean>>({
    SAIL: false,
    NYRA: false,
    RLUSD: false,
  });

  const refreshBalances = useCallback(async (address: string) => {
    const response = await fetch(`/api/balances?address=${address}`);
    const payload = await response.json();
    if (payload.success) {
      setBalances(payload.balances);
    }
  }, []);

  const getBalance = useCallback(
    (symbol: TokenCode | 'XRP') => {
      if (symbol === 'XRP') {
        const xrp = balances.find((item) => item.currency === 'XRP');
        return xrp ? Number(xrp.value) : 0;
      }

      const code = getTokenCode(symbol);
      const issuer = config?.issuerAddress?.toUpperCase();
      const item = balances.find((entry) => {
        if (entry.currency.toUpperCase() !== code?.toUpperCase()) return false;
        if (!issuer) return true;
        return (entry.issuer ?? '').toUpperCase() === issuer;
      });
      return item ? Number(item.value) : 0;
    },
    [balances, config?.issuerAddress]
  );

  const refreshMarkets = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading('refresh-markets');
    }

    try {
      const response = await fetch('/api/admin/markets');
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to load markets');
      }

      const nextMarkets: AdminMarket[] = (payload.markets as Omit<AdminMarket, 'vaultStatus'>[]).map(
        (market) => ({
          ...market,
          vaultStatus: !market.supplyVaultId ? 'missing' : market.vaultError ? 'error' : 'configured',
        })
      );

      setMarkets(nextMarkets);
      setSelectedMarketId((current) => {
        if (!current) return current;
        const exists = nextMarkets.some((market) => market.id === current);
        return exists ? current : null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh markets');
    } finally {
      if (!silent) {
        setLoading('');
      }
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const seed = loadWalletSeed();
        if (seed) {
          const restored = getWalletFromSeed(seed);
          setWallet(restored);
          await refreshBalances(restored.address);
        }

        const response = await fetch('/api/lending/config');
        const payload = await response.json();
        if (payload.success) {
          setConfig({ issuerAddress: payload.data.issuerAddress });
        }

        await refreshMarkets({ silent: true });
      } catch (error) {
        console.error('Admin init error:', error);
      }
    }

    init();
  }, [refreshBalances, refreshMarkets]);

  const copyAddress = useCallback(() => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Wallet address copied');
  }, [wallet]);

  const copyText = useCallback((value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }, []);

  const handleGenerateWallet = useCallback(async () => {
    setLoading('generate');
    try {
      await disconnect();
      const nextWallet = generateWallet();
      saveWalletSeed(nextWallet.seed);
      setWallet(nextWallet);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });

      const fundResult = await fundWalletFromFaucet(nextWallet.address);
      if (!fundResult.funded) {
        toast.error('Wallet generated but XRP faucet funding failed');
        return;
      }
      await refreshBalances(nextWallet.address);

      if (!config?.issuerAddress) {
        await refreshBalances(nextWallet.address);
        toast.error('Wallet generated and XRP funded, but issuer config is unavailable for trust lines.');
        return;
      }

      const failedTokens: TokenCode[] = [];
      const currencies = TOKEN_LIST.map((token) => getTokenCode(token) || token);
      setTrustlineEstablishing({ SAIL: true, NYRA: true, RLUSD: true });
      try {
        const trustlineResults = await submitTrustLinesParallelWithIncrementalSequence(
          nextWallet.seed,
          config.issuerAddress,
          currencies
        );

        for (const token of TOKEN_LIST) {
          const currencyCode = getTokenCode(token) || token;
          const matched = trustlineResults.find((result) => result.currency === currencyCode);
          if (!matched || matched.result !== 'tesSUCCESS') {
            failedTokens.push(token);
          }
        }
      } catch {
        failedTokens.push(...TOKEN_LIST);
      } finally {
        setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      }
      await connectLocalWallet();
      await refreshTrustLineStatuses();

      if (failedTokens.length > 0) {
        toast.error(
          `Wallet generated and funded. Trust line setup failed for: ${failedTokens.join(', ')}`
        );
      } else {
        toast.success('New wallet generated, funded with XRP, and trust lines established.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate wallet');
    } finally {
      setLoading('');
    }
  }, [config?.issuerAddress, connectLocalWallet, disconnect, refreshBalances, refreshTrustLineStatuses]);

  const handleClearLocalWallet = useCallback(async () => {
    setLoading('clear-local-wallet');

    try {
      clearWalletSeed();
      clearWalletConnection();
      await disconnect();

      setWallet(null);
      setBalances([]);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      toast.success('Local wallet and wallet connection state cleared');
    } catch {
      setWallet(null);
      setBalances([]);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      toast.error('Failed to fully disconnect active session, but local wallet metadata was cleared');
    } finally {
      setLoading('');
    }
  }, [disconnect]);

  const handleCreateVault = useCallback(async (marketId: string) => {
    setLoading(`create-vault-${marketId}`);
    try {
      const response = await fetch(`/api/admin/markets/${marketId}/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createLoanBroker: false }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to create vault');
      }

      toast.success('New vault created and market mapping updated');
      await refreshMarkets({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create vault');
    } finally {
      setLoading('');
    }
  }, [refreshMarkets]);

  const handleSwapVault = useCallback(async (marketId: string) => {
    const supplyVaultId = manualVaultId.trim();
    const supplyMptIssuanceId = manualMptIssuanceId.trim();

    if (!supplyVaultId || !supplyMptIssuanceId) {
      toast.error('Vault ID and MPT Issuance ID are required');
      return;
    }

    setLoading(`swap-vault-${marketId}`);
    try {
      const response = await fetch(`/api/admin/markets/${marketId}/vault`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplyVaultId,
          supplyMptIssuanceId,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to swap vault');
      }

      toast.success('Market vault mapping updated');
      await refreshMarkets({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to swap vault');
    } finally {
      setLoading('');
    }
  }, [manualMptIssuanceId, manualVaultId, refreshMarkets]);

  const handleToggleStatus = useCallback(async (marketId: string, currentStatus: boolean) => {
    setLoading(`toggle-status-${marketId}`);
    try {
      const response = await fetch(`/api/admin/markets/${marketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to update market status');
      }

      toast.success(`Market ${currentStatus ? 'deactivated' : 'activated'}`);
      await refreshMarkets({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update market status');
    } finally {
      setLoading('');
    }
  }, [refreshMarkets]);

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin Wallet Tools</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page is for local XRPL setup (devnet). Wallet seed is persisted in localStorage.
          </p>
        </div>

        <LocalWalletCard
          wallet={wallet}
          loading={loading}
          onCopyAddress={copyAddress}
          onClearLocalWallet={() => void handleClearLocalWallet()}
        />

        <WalletToolsGrid
          tokenList={TOKEN_LIST}
          trustlineEstablishing={trustlineEstablishing}
          trustLineStatusByToken={trustLineStatusByToken as Record<string, string | undefined>}
          hasTrustLineByToken={hasTrustLineByToken as Record<string, boolean | undefined>}
          loading={loading}
          onGenerateWallet={() => void handleGenerateWallet()}
        />

        <WalletBalancesCard
          walletConnected={Boolean(wallet)}
          tokenList={TOKEN_LIST}
          getBalance={getBalance as (symbol: string) => number}
        />

        <MarketVaultManagementCard
          markets={markets}
          selectedMarketId={selectedMarketId}
          manualVaultId={manualVaultId}
          manualMptIssuanceId={manualMptIssuanceId}
          loading={loading}
          onRefresh={() => void refreshMarkets()}
          onSelectMarket={(market) => {
            setSelectedMarketId(market.id);
            setManualVaultId(market.supplyVaultId ?? '');
            setManualMptIssuanceId(market.supplyMptIssuanceId ?? '');
          }}
          onDeselectMarket={() => setSelectedMarketId(null)}
          onSetManualVaultId={setManualVaultId}
          onSetManualMptIssuanceId={setManualMptIssuanceId}
          onCreateVault={(marketId) => void handleCreateVault(marketId)}
          onToggleStatus={(marketId, currentStatus) => void handleToggleStatus(marketId, currentStatus)}
          onSwapVault={(marketId) => void handleSwapVault(marketId)}
          onCopyText={copyText}
        />
      </div>
    </div>
  );
}
