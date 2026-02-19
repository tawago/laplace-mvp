'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Building2, CheckCircle, CreditCard, Home, Loader2, Shield, TrendingUp, Wallet } from 'lucide-react';

type Status = 'payment-select' | 'processing' | 'success' | 'error';
type PaymentMethod = 'wallet' | 'card' | 'wire';

interface PurchaseConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelName: string;
  hotelId: string;
  unitName: string;
  unitId: string;
  unitType: string;
  tokenAmount: number;
  maxTokenAmount: number;
  onTokenAmountChange: (nextAmount: number) => void;
  tokenPrice: number;
  totalPrice: number;
  roiPercentage: number;
  rlusdBalance: number;
  userAddress: string | null;
  walletSeed: string | null;
  issuerAddress: string;
  hasRlusdTrustLine: boolean;
  refreshBalances: () => Promise<{ rlusdBalance: number; hasRlusdTrustLine: boolean } | null>;
  onOnrampRequest: (amount: number, onComplete: () => void) => void;
  onConfirm: () => void;
  onSuccess?: () => void;
}

const walletProcessingSteps = [
  'Checking wallet and balance...',
  'Submitting RLUSD payment...',
  'Confirming transaction...',
  'Finalizing purchase...',
];

const directProcessingSteps = [
  'Verifying payment session...',
  'Confirming payment method...',
  'Issuing RWA tokens...',
  'Finalizing purchase...',
];

export function PurchaseConfirmationDialog({
  open,
  onOpenChange,
  hotelName,
  hotelId,
  unitName,
  unitId,
  unitType,
  tokenAmount,
  maxTokenAmount,
  onTokenAmountChange,
  tokenPrice,
  totalPrice,
  roiPercentage,
  rlusdBalance,
  userAddress,
  walletSeed,
  issuerAddress,
  hasRlusdTrustLine,
  refreshBalances,
  onOnrampRequest,
  onConfirm,
  onSuccess,
}: PurchaseConfirmationDialogProps) {
  const [status, setStatus] = useState<Status>('payment-select');
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [tokenTxHash, setTokenTxHash] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('wallet');

  const annualReturn = useMemo(() => (totalPrice * roiPercentage) / 100, [roiPercentage, totalPrice]);
  const deficit = Math.max(0, totalPrice - rlusdBalance);
  const canPayFromWallet = rlusdBalance >= totalPrice;
  const activeProcessingSteps = selectedPaymentMethod === 'wallet' ? walletProcessingSteps : directProcessingSteps;

  const resetState = () => {
    setStatus('payment-select');
    setProcessingStep(0);
    setErrorMessage(null);
    setTxHash(null);
  };

  useEffect(() => {
    if (!open) {
      setStatus('payment-select');
      setProcessingStep(0);
      setErrorMessage(null);
      setTxHash(null);
      setTokenTxHash(null);
      setSelectedPaymentMethod('wallet');
    }
  }, [open]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleWalletPayment = async () => {
    if (!userAddress) {
      setStatus('error');
      setErrorMessage('Wallet is disconnected. Connect your wallet before purchasing tokens.');
      return;
    }

    if (!walletSeed) {
      setStatus('error');
      setErrorMessage('Wallet signer seed is unavailable. Reconnect your local wallet and retry.');
      return;
    }

    if (!hasRlusdTrustLine) {
      setStatus('error');
      setErrorMessage('RLUSD trust line is not ready. Create or refresh trust line before purchasing.');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setProcessingStep(0);

    try {
      setProcessingStep(1);
      const snapshot = await refreshBalances();
      const latestBalance = snapshot?.rlusdBalance ?? rlusdBalance;
      const trustLineReady = snapshot?.hasRlusdTrustLine ?? hasRlusdTrustLine;
      if (!trustLineReady) {
        throw new Error('RLUSD trust line is not ready at execution time.');
      }
      if (latestBalance < totalPrice) {
        const shortfall = totalPrice - latestBalance;
        throw new Error(`Insufficient RLUSD at execution time. Need ${shortfall.toFixed(2)} more RLUSD.`);
      }

      setProcessingStep(2);
      const response = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          walletSeed,
          hotelId,
          unitId,
          tokenAmount,
          pricePerToken: tokenPrice,
          totalPrice,
          paymentMethod: 'wallet',
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? payload?.error ?? 'Purchase API call failed');
      }

      setTxHash(typeof payload.data?.paymentTxHash === 'string' ? payload.data.paymentTxHash : null);
      setTokenTxHash(typeof payload.data?.tokenTxHash === 'string' ? payload.data.tokenTxHash : null);
      setProcessingStep(3);
      await refreshBalances();
      onConfirm();
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete purchase payment.');
    }
  };

  const handleDirectPayment = async (method: 'card' | 'wire') => {
    if (!userAddress) {
      setStatus('error');
      setErrorMessage('Wallet is disconnected. Connect your wallet before purchasing tokens.');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setProcessingStep(0);

    try {
      await sleep(300);
      setProcessingStep(1);
      await sleep(300);
      setProcessingStep(2);

      const response = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          hotelId,
          unitId,
          tokenAmount,
          pricePerToken: tokenPrice,
          totalPrice,
          paymentMethod: method,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? payload?.error ?? 'Purchase API call failed');
      }

      setTxHash(typeof payload.data?.paymentTxHash === 'string' ? payload.data.paymentTxHash : null);
      setTokenTxHash(typeof payload.data?.tokenTxHash === 'string' ? payload.data.tokenTxHash : null);
      setProcessingStep(3);
      await sleep(300);
      await refreshBalances();
      onConfirm();
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete direct purchase.');
    }
  };

  const handleTopUp = () => {
    const shortfall = Math.max(0, totalPrice - rlusdBalance);
    const buffer = Math.max(10, shortfall * 0.1);
    const topUpAmount = shortfall + buffer;

    onOnrampRequest(topUpAmount, () => {
      void handleWalletPayment();
    });
  };

  const handleCancel = () => {
    if (status === 'payment-select' || status === 'error' || status === 'success') {
      if (status === 'success') {
        onSuccess?.();
      }
      onOpenChange(false);
      resetState();
    }
  };

  return (
    <Dialog open={open} onOpenChange={status === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        {status === 'payment-select' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Token Purchase</DialogTitle>
              <DialogDescription>Choose payment method to complete this purchase.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Property</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{hotelName}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {unitName} - Type {unitType}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Number of Tokens</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onTokenAmountChange(Math.max(1, tokenAmount - 1))}
                      disabled={tokenAmount <= 1}
                    >
                      -
                    </Button>
                    <input
                      type="number"
                      min="1"
                      max={maxTokenAmount}
                      value={tokenAmount}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          onTokenAmountChange(0);
                          return;
                        }
                        onTokenAmountChange(Math.min(maxTokenAmount, Math.max(0, parsed)));
                      }}
                      className="w-12 border-0 bg-transparent p-0 text-right font-semibold focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onTokenAmountChange(Math.min(maxTokenAmount, tokenAmount + 1))}
                      disabled={tokenAmount >= maxTokenAmount}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Price per Token</span>
                  <span className="font-medium mr-5">${tokenPrice}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total Investment</span>
                  <span className="text-xl font-bold">${totalPrice.toLocaleString()}</span>
                </div>
              </div>
              <Separator />

              <div className="grid gap-3">
                <Card
                  className={`cursor-pointer p-4 transition-colors ${
                    selectedPaymentMethod === 'wallet'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                  onClick={() => setSelectedPaymentMethod('wallet')}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">From Wallet</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Balance: {rlusdBalance.toFixed(2)} RLUSD
                      </p>
                      {!hasRlusdTrustLine ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          RLUSD trust line not ready
                        </p>
                      ) : null}
                      {!canPayFromWallet ? (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Shortfall: {deficit.toFixed(2)} RLUSD
                        </p>
                      ) : null}
                    </div>
                    <Wallet className="h-4 w-4 text-zinc-500" />
                  </div>
                </Card>

                <Card
                  className={`cursor-pointer p-4 transition-colors ${
                    selectedPaymentMethod === 'card'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                  onClick={() => setSelectedPaymentMethod('card')}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">Credit / Debit Card</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Pay directly and receive tokens.</p>
                    </div>
                    <CreditCard className="h-4 w-4 text-zinc-500" />
                  </div>
                </Card>

                <Card
                  className={`cursor-pointer p-4 transition-colors ${
                    selectedPaymentMethod === 'wire'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                  onClick={() => setSelectedPaymentMethod('wire')}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">Bank Wire</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Pay via wire and auto-issue tokens.</p>
                    </div>
                    <Building2 className="h-4 w-4 text-zinc-500" />
                  </div>
                </Card>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <div className="flex justify-end">
                {selectedPaymentMethod === 'wallet' ? (
                  canPayFromWallet ? (
                    <Button
                      onClick={() => void handleWalletPayment()}
                      disabled={!hasRlusdTrustLine || tokenAmount < 1 || tokenAmount > maxTokenAmount}
                    >
                      <Wallet className="mr-1 h-4 w-4" />
                      Pay from Wallet
                    </Button>
                  ) : (
                    <Button onClick={handleTopUp} disabled={!hasRlusdTrustLine}>
                      <Wallet className="mr-1 h-4 w-4" />
                      Top up and Pay
                    </Button>
                  )
                ) : selectedPaymentMethod === 'card' ? (
                  <Button onClick={() => void handleDirectPayment('card')}>
                    <CreditCard className="mr-1 h-4 w-4" />
                    Pay with Card
                  </Button>
                ) : (
                  <Button onClick={() => void handleDirectPayment('wire')}>
                    <Building2 className="mr-1 h-4 w-4" />
                    Pay with Wire
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}

        {status === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Purchase Payment</DialogTitle>
              <DialogDescription>Please keep this window open.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="flex justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
              </div>

              <div className="space-y-2">
                {activeProcessingSteps.map((stepText, index) => (
                  <div key={stepText} className="flex items-center gap-2 text-sm">
                    {index <= processingStep ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-zinc-400" />
                    )}
                    <span className={index <= processingStep ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>
                      {stepText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Payment Failed</DialogTitle>
              <DialogDescription>Your purchase is not completed yet.</DialogDescription>
            </DialogHeader>

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage ?? 'An unknown error occurred.'}</AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={() => setStatus('payment-select')}>Retry</Button>
            </DialogFooter>
          </>
        )}

        {status === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Purchase Successful</DialogTitle>
              <DialogDescription>Your token purchase payment has been completed.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/20">
                  <CheckCircle className="h-14 w-14 text-emerald-600" />
                </div>
              </div>

              <Card className="p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Purchased</span>
                    <span className="font-medium">{tokenAmount.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Paid</span>
                    <span className="font-medium">{totalPrice.toFixed(2)} RLUSD</span>
                  </div>
                  {txHash ? (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Payment Tx</span>
                      <span className="font-mono text-xs">{txHash.slice(0, 12)}...</span>
                    </div>
                  ) : null}
                  {tokenTxHash ? (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">RWA Tx</span>
                      <span className="font-mono text-xs">{tokenTxHash.slice(0, 12)}...</span>
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span>Tokens are now secured in your wallet</span>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleCancel}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
