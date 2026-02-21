'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

interface MarketPricesContextType {
  pricesByHotelId: Record<string, number>;
  isLoading: boolean;
  error?: string;
  refreshPrices: () => Promise<void>;
  hasPriceForHotel: (hotelId: string) => boolean;
  getTokenPrice: (hotelId: string, fallbackPrice: number) => number;
}

const MarketPricesContext = createContext<MarketPricesContextType | undefined>(undefined);

const HOTEL_ID_BY_COLLATERAL_CURRENCY: Record<string, string> = {
  [TOKEN_CODE_BY_SYMBOL.SAIL.toUpperCase()]: 'the-sail',
  [TOKEN_CODE_BY_SYMBOL.NYRA.toUpperCase()]: 'nyra',
};

type LendingConfigMarket = {
  name?: string;
  collateralCurrency?: string;
  prices?: {
    collateralPriceUsd?: number;
  };
};

export function MarketPricesProvider({ children }: { children: React.ReactNode }) {
  const [pricesByHotelId, setPricesByHotelId] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refreshPrices = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch('/api/lending/config');
      const payload = await response.json();

      if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.markets)) {
        throw new Error(payload?.error?.message ?? 'Failed to load market prices');
      }

      const nextPrices: Record<string, number> = {};

      for (const market of payload.data.markets as LendingConfigMarket[]) {
        const collateralPriceUsd = market.prices?.collateralPriceUsd;
        if (typeof collateralPriceUsd !== 'number' || collateralPriceUsd <= 0) {
          continue;
        }

        const collateralCurrency = market.collateralCurrency?.toUpperCase() ?? '';
        const knownHotelId = HOTEL_ID_BY_COLLATERAL_CURRENCY[collateralCurrency];
        if (knownHotelId) {
          nextPrices[knownHotelId] = collateralPriceUsd;
          continue;
        }

        const marketName = market.name?.toUpperCase() ?? '';
        if (marketName.includes('SAIL')) {
          nextPrices['the-sail'] = collateralPriceUsd;
        }
        if (marketName.includes('NYRA')) {
          nextPrices.nyra = collateralPriceUsd;
        }
      }

      setPricesByHotelId(nextPrices);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load market prices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPrices();
  }, [refreshPrices]);

  const value = useMemo<MarketPricesContextType>(
    () => ({
      pricesByHotelId,
      isLoading,
      error,
      refreshPrices,
      hasPriceForHotel: (hotelId: string) => typeof pricesByHotelId[hotelId] === 'number',
      getTokenPrice: (hotelId: string, fallbackPrice: number) => pricesByHotelId[hotelId] ?? fallbackPrice,
    }),
    [error, isLoading, pricesByHotelId, refreshPrices]
  );

  return <MarketPricesContext.Provider value={value}>{children}</MarketPricesContext.Provider>;
}

export function useMarketPrices(): MarketPricesContextType {
  const context = useContext(MarketPricesContext);
  if (!context) {
    throw new Error('useMarketPrices must be used within a MarketPricesProvider');
  }
  return context;
}
