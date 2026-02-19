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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Banknote, Building2, CheckCircle, Clock, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendTokenToBackend } from '@/lib/client/xrpl';

interface OfframpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
  userAddress: string;
  walletSeed: string;
  issuerAddress: string;
  onSuccess?: (amount: number) => void;
}

interface WithdrawalMethod {
  id: string;
  name: string;
  icon: typeof CreditCard;
  fee: string;
  processingTime: string;
  minAmount: number;
}

const withdrawalMethods: WithdrawalMethod[] = [
  {
    id: 'bank',
    name: 'Bank Transfer',
    icon: Building2,
    fee: '0.5%',
    processingTime: '1-3 business days',
    minAmount: 50,
  },
  {
    id: 'card',
    name: 'Debit Card',
    icon: CreditCard,
    fee: '3.5%',
    processingTime: 'Instant',
    minAmount: 10,
  },
];

type Step = 'amount' | 'method' | 'processing' | 'success';

const processingSteps = [
  'Preparing withdrawal transaction...',
  'Signing with your wallet...',
  'Submitting transfer to XRPL...',
];

export function OfframpDialog({
  open,
  onOpenChange,
  availableBalance,
  userAddress,
  walletSeed,
  issuerAddress,
  onSuccess,
}: OfframpDialogProps) {
  const [step, setStep] = useState<Step>('amount');
  const [selectedMethod, setSelectedMethod] = useState<WithdrawalMethod | null>(null);
  const [amount, setAmount] = useState(100);
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('amount');
      setSelectedMethod(null);
      setAmount(100);
      setProcessingStep(0);
      setErrorMessage(null);
      setTxHash(null);
    }
  }, [open]);

  const fee = useMemo(() => {
    if (!selectedMethod) return 0;
    const rate = Number.parseFloat(selectedMethod.fee.replace('%', '')) / 100;
    return amount * rate;
  }, [amount, selectedMethod]);

  const netUsd = amount - fee;

  const handleAmountNext = () => {
    if (!userAddress || !walletSeed || !issuerAddress) {
      setErrorMessage('Wallet, seed, or issuer config is missing. Reconnect and retry.');
      return;
    }
    if (amount <= 0) {
      setErrorMessage('Amount must be greater than 0.');
      return;
    }
    if (amount > availableBalance) {
      setErrorMessage('Insufficient RLUSD balance.');
      return;
    }

    setErrorMessage(null);
    setStep('method');
  };

  const handleConfirm = async () => {
    if (!selectedMethod) return;
    if (amount < selectedMethod.minAmount) {
      setErrorMessage(`Minimum for ${selectedMethod.name} is ${selectedMethod.minAmount} RLUSD.`);
      return;
    }

    setErrorMessage(null);
    setProcessingStep(0);
    setStep('processing');

    const interval = window.setInterval(() => {
      setProcessingStep((prev) => (prev < processingSteps.length - 1 ? prev + 1 : prev));
    }, 900);

    try {
      const result = await sendTokenToBackend(
        walletSeed,
        issuerAddress,
        'RLUSD',
        amount.toString(),
        issuerAddress
      );

      if (result.result !== 'tesSUCCESS') {
        throw new Error(`Offramp transfer failed: ${result.result}`);
      }

      setTxHash(result.hash);
      setProcessingStep(processingSteps.length - 1);
      setStep('success');
      onSuccess?.(amount);
      toast.success('Withdrawal submitted', {
        description: `${amount.toFixed(2)} RLUSD sent for off-ramp settlement.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit withdrawal.';
      setErrorMessage(message);
      setStep('method');
      toast.error('Withdrawal failed', { description: message });
    } finally {
      window.clearInterval(interval);
    }
  };

  return (
    <Dialog open={open} onOpenChange={step === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'amount' && (
          <>
            <DialogHeader>
              <DialogTitle>Withdraw RLUSD</DialogTitle>
              <DialogDescription>Send RLUSD from your wallet to issuer for off-ramp settlement.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Card className="bg-zinc-50 dark:bg-zinc-900">
                <CardContent className="p-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Available RLUSD</p>
                  <p className="text-2xl font-bold">{availableBalance.toFixed(2)}</p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <input
                  type="number"
                  min="0"
                  max={availableBalance}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(Number.parseFloat(event.target.value) || 0)}
                  className="w-full rounded-md border bg-white px-4 py-3 text-lg font-semibold dark:bg-zinc-950"
                />
                <p className="text-xs text-zinc-500">Max: {availableBalance.toFixed(2)} RLUSD</p>
              </div>

              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleAmountNext}>Continue</Button>
            </DialogFooter>
          </>
        )}

        {step === 'method' && (
          <>
            <DialogHeader>
              <DialogTitle>Select Withdrawal Method</DialogTitle>
              <DialogDescription>Pick settlement rail for fiat payout.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {withdrawalMethods.map((method) => {
                const disabled = amount < method.minAmount;
                return (
                  <Card
                    key={method.id}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod?.id === method.id
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    } ${disabled ? 'opacity-60' : ''}`}
                    onClick={() => {
                      if (!disabled) {
                        setSelectedMethod(method);
                        setErrorMessage(null);
                      }
                    }}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <method.icon className="h-5 w-5 text-zinc-600" />
                        <div>
                          <p className="font-medium">{method.name}</p>
                          <p className="text-xs text-zinc-500">
                            Min {method.minAmount} RLUSD • Fee {method.fee} • {method.processingTime}
                          </p>
                        </div>
                      </div>
                      {selectedMethod?.id === method.id ? <CheckCircle className="h-5 w-5 text-green-600" /> : null}
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="bg-zinc-50 dark:bg-zinc-900">
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Withdrawal amount</span>
                    <span>{amount.toFixed(2)} RLUSD</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Fee</span>
                    <span>{fee.toFixed(2)} RLUSD</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span>Estimated fiat settlement</span>
                    <span>${netUsd.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('amount')}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedMethod}>
                <Banknote className="mr-2 h-4 w-4" />
                Confirm Offramp
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Withdrawal</DialogTitle>
              <DialogDescription>Signing and submitting your RLUSD transfer.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <Loader2 className="h-14 w-14 animate-spin text-green-600" />
              </div>

              <div className="space-y-2">
                {processingSteps.map((text, index) => (
                  <div key={text} className="flex items-center gap-2 text-sm">
                    {index <= processingStep ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-zinc-400" />}
                    <span className={index <= processingStep ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Withdrawal Submitted</DialogTitle>
              <DialogDescription>Your off-ramp transfer has been sent.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/20">
                  <CheckCircle className="h-14 w-14 text-emerald-600" />
                </div>
              </div>

              <Card>
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Sent</span>
                    <span className="font-semibold">{amount.toFixed(2)} RLUSD</span>
                  </div>
                  {txHash ? (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Transaction</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {txHash.slice(0, 10)}...
                      </Badge>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
