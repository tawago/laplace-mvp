import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WalletToolsGridProps {
  tokenList: readonly string[];
  trustlineEstablishing: Record<string, boolean>;
  trustLineStatusByToken: Record<string, string | undefined>;
  hasTrustLineByToken: Record<string, boolean | undefined>;
  loading: string;
  onGenerateWallet: () => void;
}

export function WalletToolsGrid({
  tokenList,
  trustlineEstablishing,
  trustLineStatusByToken,
  hasTrustLineByToken,
  loading,
  onGenerateWallet,
}: WalletToolsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Token faucets are deprecated. You can now get RLUSD, SAIL, and NYRA from Wallet and Property purchase flows.
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate New Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Creates a fresh wallet, saves seed in localStorage, auto-funds XRP, and establishes SAIL/NYRA/RLUSD trust lines.
          </p>
          <Button onClick={onGenerateWallet} disabled={loading === 'generate'} className="w-full">
            {loading === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate + Fund
          </Button>
        </CardContent>
      </Card>

      {tokenList.map((token) => (
        <Card key={token}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Faucet {token}
              {trustlineEstablishing[token] || trustLineStatusByToken[token] === 'checking' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : (
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    hasTrustLineByToken[token] ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={
                    hasTrustLineByToken[token] ? `${token} trust line ready` : `${token} trust line missing`
                  }
                />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Deprecated. Use Wallet page for RLUSD and Property pages for SAIL/NYRA purchases.
            </p>
            <Button disabled className="w-full" variant="outline">
              Request {token} (Deprecated)
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
