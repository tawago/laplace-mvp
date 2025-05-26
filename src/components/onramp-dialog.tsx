'use client';

import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  CreditCard,
  Building2,
  Smartphone,
  CheckCircle,
  DollarSign,
  ArrowRight,
  Clock,
  Shield,
  Coins,
} from 'lucide-react';
import { toast } from 'sonner';

interface OnrampDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (amount: number) => void;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: typeof CreditCard;
  description: string;
  fee: string;
  processingTime: string;
  available: boolean;
}

const paymentMethods: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    icon: CreditCard,
    description: 'Visa, Mastercard, American Express',
    fee: '2.5%',
    processingTime: 'Instant',
    available: true,
  },
  {
    id: 'bank',
    name: 'Bank Transfer',
    icon: Building2,
    description: 'Direct bank transfer (ACH/Wire)',
    fee: '0.5%',
    processingTime: '1-3 business days',
    available: true,
  },
  {
    id: 'pix',
    name: 'PIX',
    icon: Smartphone,
    description: 'Brazilian instant payment',
    fee: '1.0%',
    processingTime: 'Instant',
    available: true,
  },
];

export function OnrampDialog({ open, onOpenChange, onSuccess }: OnrampDialogProps) {
  const [step, setStep] = useState<'amount' | 'payment' | 'processing' | 'success'>('amount');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState(1000);
  const [processingStep, setProcessingStep] = useState(0);
  
  const processingSteps = [
    'Validating payment details...',
    'Processing payment...',
    'Converting to USDC...',
    'Depositing to wallet...',
    'Transaction complete!',
  ];

  const usdcAmount = amount * 0.998; // Simulating slight conversion rate
  const fee = selectedMethod ? (amount * parseFloat(selectedMethod.fee.replace('%', '')) / 100) : 0;
  const total = amount + fee;

  const handleAmountNext = () => {
    if (amount < 10) {
      toast.error('Minimum deposit is $10');
      return;
    }
    setStep('payment');
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleProcessPayment = async () => {
    if (!selectedMethod) return;
    
    setStep('processing');
    setProcessingStep(0);

    // Simulate processing steps
    for (let i = 0; i < processingSteps.length; i++) {
      setProcessingStep(i);
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    setStep('success');
    
    // Auto close and call success callback
    setTimeout(() => {
      onOpenChange(false);
      if (onSuccess) onSuccess(usdcAmount);
      toast.success('Deposit successful!', {
        description: `${usdcAmount.toFixed(2)} USDC deposited to your wallet`,
      });
      // Reset for next use
      setTimeout(() => {
        setStep('amount');
        setSelectedMethod(null);
        setAmount(1000);
        setProcessingStep(0);
      }, 500);
    }, 3000);
  };

  const handleClose = () => {
    if (step !== 'processing') {
      onOpenChange(false);
      // Reset state
      setTimeout(() => {
        setStep('amount');
        setSelectedMethod(null);
        setAmount(1000);
        setProcessingStep(0);
      }, 300);
    }
  };


  return (
    <Dialog open={open} onOpenChange={step === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'amount' && (
          <>
            <DialogHeader>
              <DialogTitle>Deposit Funds</DialogTitle>
              <DialogDescription>
                Add funds to your wallet to purchase tokens
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Amount Input */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Deposit Amount (USD)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="number"
                    min="10"
                    max="50000"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border bg-white pl-10 pr-4 py-3 text-lg font-semibold dark:bg-zinc-950"
                    placeholder="1000"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Minimum: $10 • Maximum: $50,000
                </p>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[100, 500, 1000, 5000].map((quickAmount) => (
                  <Button
                    key={quickAmount}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(quickAmount)}
                    className={amount === quickAmount ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''}
                  >
                    ${quickAmount}
                  </Button>
                ))}
              </div>

              {/* Conversion Info */}
              <Card className="bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">You&apos;ll receive</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    ≈ {usdcAmount.toFixed(2)} USDC
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    Exchange rate: 1 USD = 0.998 USDC
                  </p>
                </CardContent>
              </Card>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your funds will be converted to USDC, the platform&apos;s native currency for investments.
                </AlertDescription>
              </Alert>
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
              <DialogDescription>
                Select how you&apos;d like to fund your deposit
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Payment Methods */}
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <Card
                    key={method.id}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod?.id === method.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    } ${!method.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => method.available && handlePaymentMethodSelect(method)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <method.icon className="h-5 w-5 mt-0.5 text-zinc-600" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{method.name}</span>
                            {!method.available && <Badge variant="secondary">Coming Soon</Badge>}
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {method.description}
                          </p>
                          <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                            <span>Fee: {method.fee}</span>
                            <span>•</span>
                            <span>{method.processingTime}</span>
                          </div>
                        </div>
                        {selectedMethod?.id === method.id && (
                          <CheckCircle className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Summary */}
              {selectedMethod && (
                <Card className="bg-zinc-50 dark:bg-zinc-900">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Deposit Amount</span>
                      <span>${amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Processing Fee ({selectedMethod.fee})</span>
                      <span>${fee.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total Charge</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>You&apos;ll receive</span>
                      <span>{usdcAmount.toFixed(2)} USDC</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('amount')}>
                Back
              </Button>
              <Button 
                onClick={handleProcessPayment}
                disabled={!selectedMethod}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Process Payment
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Deposit</DialogTitle>
              <DialogDescription>
                Please wait while we process your payment
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold">
                      {Math.round((processingStep + 1) / processingSteps.length * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {processingSteps.map((stepText, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 text-sm ${
                      index === processingStep
                        ? 'text-blue-600 dark:text-blue-400'
                        : index < processingStep
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-400 dark:text-zinc-600'
                    }`}
                  >
                    {index < processingStep ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : index === processingStep ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-current" />
                    )}
                    <span>{stepText}</span>
                  </div>
                ))}
              </div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Processing time: {selectedMethod?.processingTime}. Do not close this window.
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Deposit Successful!</DialogTitle>
              <DialogDescription>
                Your funds have been added to your wallet
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/20">
                  <CheckCircle className="h-16 w-16 text-emerald-600" />
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">
                  {usdcAmount.toFixed(2)} USDC deposited successfully!
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Funds are now available in your wallet
                </p>
              </div>

              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Transaction ID</span>
                    <span className="font-mono text-xs">0x{Math.random().toString(16).substr(2, 8)}...</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Payment Method</span>
                    <span className="font-medium">{selectedMethod?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Network</span>
                    <span className="font-medium">Ethereum (ERC-20)</span>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Coins className="h-4 w-4 text-emerald-600" />
                <span>USDC is now available for token purchases</span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}