import { Copy, Loader2, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WalletInfo } from '@/lib/client/xrpl';

interface LocalWalletCardProps {
  wallet: WalletInfo | null;
  loading: string;
  onCopyAddress: () => void;
  onClearLocalWallet: () => void;
}

export function LocalWalletCard({
  wallet,
  loading,
  onCopyAddress,
  onClearLocalWallet,
}: LocalWalletCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Current Local Wallet
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {wallet ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="default">Loaded</Badge>
                <span className="font-mono">{wallet.address}</span>
                <button
                  onClick={onCopyAddress}
                  aria-label="Copy wallet address"
                  className="text-slate-500 hover:text-slate-700"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Regenerate a new wallet only if you want to replace the saved one.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No wallet in localStorage yet.</p>
          )}
        </div>

        <div className="sm:shrink-0">
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            onClick={onClearLocalWallet}
            disabled={loading === 'clear-local-wallet'}
          >
            {loading === 'clear-local-wallet' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Clear Local Wallet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
