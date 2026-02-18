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
import { ArrowRight, Building2, CheckCircle, Clock, CreditCard, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface OnrampDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userAddress: string;
  initialAmount?: number;
  minimumAmount?: number;
  onSuccess?: (amount: number) => void;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: typeof CreditCard;
  fee: string;
  processingTime: string;
}

const paymentMethods: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    icon: CreditCard,
    fee: '2.5%',
    processingTime: 'Instant',
  },
  {
    id: 'bank',
    name: 'Bank Transfer',
    icon: Building2,
    fee: '0.5%',
    processingTime: '1-3 business days',
  },
  {
    id: 'pix',
    name: 'PIX',
    icon: Smartphone,
    fee: '1.0%',
    processingTime: 'Instant',
  },
];

type Step = 'amount' | 'payment' | 'processing' | 'success';

const processingSteps = [
  'Validating account and trust line...',
  'Submitting RLUSD transfer...',
  'Confirming XRPL transaction...',
];

export function OnrampDialog({
  open,
  onOpenChange,
  userAddress,
  initialAmount,
  minimumAmount = 10,
  onSuccess,
}: OnrampDialogProps) {
  const defaultAmount = Math.max(minimumAmount, initialAmount ?? 1000);

  const [step, setStep] = useState<Step>('amount');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState(defaultAmount);
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('amount');
      setSelectedMethod(null);
      setProcessingStep(0);
      setErrorMessage(null);
      setTxHash(null);
      setAmount(defaultAmount);
      return;
    }

    setAmount(defaultAmount);
  }, [defaultAmount, open]);

  const fee = useMemo(() => {
    if (!selectedMethod) return 0;
    const rate = Number.parseFloat(selectedMethod.fee.replace('%', '')) / 100;
    return amount * rate;
  }, [amount, selectedMethod]);

  const totalCharge = amount + fee;

  const handleAmountNext = () => {
    if (!userAddress) {
      setErrorMessage('Connect your wallet before starting a top-up.');
      return;
    }

    if (amount < minimumAmount) {
      setErrorMessage(`Minimum top-up is ${minimumAmount.toFixed(2)} RLUSD.`);
      return;
    }

    setErrorMessage(null);
    setStep('payment');
  };

  const handleProcessPayment = async () => {
    if (!selectedMethod) return;
    if (!userAddress) {
      setErrorMessage('Wallet not connected. Connect your wallet to continue.');
      return;
    }

    setErrorMessage(null);
    setProcessingStep(0);
    setStep('processing');

    const interval = window.setInterval(() => {
      setProcessingStep((prev) => (prev < processingSteps.length - 1 ? prev + 1 : prev));
    }, 900);

    try {
      const response = await fetch('/api/onramp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress, amount: amount.toString() }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to complete onramp transfer. Please retry.');
      }

      setTxHash(typeof payload.txHash === 'string' ? payload.txHash : null);
      setProcessingStep(processingSteps.length - 1);
      setStep('success');
      onSuccess?.(amount);
      toast.success('Top-up completed', {
        description: `${amount.toFixed(2)} RLUSD added to your wallet.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onramp failed. Please retry.';
      setErrorMessage(message);
      setStep('payment');
      toast.error('Top-up failed', { description: message });
    } finally {
      window.clearInterval(interval);
    }
  };

  const handleClose = () => {
    if (step !== 'processing') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={step === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'amount' && (
          <>
            <DialogHeader>
              <DialogTitle>Deposit RLUSD</DialogTitle>
              <DialogDescription>Add RLUSD to your wallet before purchase.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Top-up Amount (RLUSD)</label>
                <input
                  type="number"
                  min={minimumAmount}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(Number.parseFloat(event.target.value) || 0)}
                  className="w-full rounded-md border bg-white px-4 py-3 text-lg font-semibold dark:bg-zinc-950"
                />
                <p className="text-xs text-zinc-500">Minimum: {minimumAmount.toFixed(2)} RLUSD</p>
              </div>

              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAmountNext}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'payment' && (
          <>
            <DialogHeader>
              <DialogTitle>Choose Payment Method</DialogTitle>
              <DialogDescription>Select your top-up payment method.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <Card
                    key={method.id}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod?.id === method.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                    onClick={() => setSelectedMethod(method)}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <method.icon className="h-5 w-5 text-zinc-600" />
                        <div>
                          <p className="font-medium">{method.name}</p>
                          <p className="text-xs text-zinc-500">Fee {method.fee} • {method.processingTime}</p>
                        </div>
                      </div>
                      {selectedMethod?.id === method.id ? <CheckCircle className="h-5 w-5 text-blue-600" /> : null}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-zinc-50 dark:bg-zinc-900">
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Top-up amount</span>
                    <span>{amount.toFixed(2)} RLUSD</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Fee</span>
                    <span>{fee.toFixed(2)} RLUSD</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total charge</span>
                    <span>{totalCharge.toFixed(2)} USD</span>
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
              <Button onClick={handleProcessPayment} disabled={!selectedMethod}>
                Confirm Top-up
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Top-up</DialogTitle>
              <DialogDescription>Submitting RLUSD transfer. Keep this window open.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <Loader2 className="h-14 w-14 animate-spin text-blue-600" />
              </div>

              <div className="space-y-2">
                {processingSteps.map((stepText, index) => (
                  <div key={stepText} className="flex items-center gap-2 text-sm">
                    {index <= processingStep ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-zinc-400" />}
                    <span className={index <= processingStep ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>{stepText}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Top-up Successful</DialogTitle>
              <DialogDescription>Your RLUSD wallet balance is now updated.</DialogDescription>
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
                    <span className="text-zinc-500">Transferred</span>
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
