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
  Clock,
  Shield,
  Coins,
  Banknote,
} from 'lucide-react';
import { toast } from 'sonner';

interface OfframpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
  onSuccess?: (amount: number) => void;
}

interface WithdrawalMethod {
  id: string;
  name: string;
  icon: typeof CreditCard;
  description: string;
  fee: string;
  processingTime: string;
  minAmount: number;
  available: boolean;
}

const withdrawalMethods: WithdrawalMethod[] = [
  {
    id: 'bank',
    name: 'Bank Transfer',
    icon: Building2,
    description: 'Direct transfer to your bank account',
    fee: '0.5%',
    processingTime: '1-3 business days',
    minAmount: 50,
    available: true,
  },
  {
    id: 'card',
    name: 'Debit Card',
    icon: CreditCard,
    description: 'Instant withdrawal to debit card',
    fee: '3.5%',
    processingTime: 'Instant',
    minAmount: 10,
    available: true,
  },
  {
    id: 'pix',
    name: 'PIX',
    icon: Smartphone,
    description: 'Instant PIX transfer (Brazil)',
    fee: '1.5%',
    processingTime: 'Instant',
    minAmount: 25,
    available: true,
  },
];

export function OfframpDialog({ 
  open, 
  onOpenChange, 
  availableBalance, 
  onSuccess 
}: OfframpDialogProps) {
  const [step, setStep] = useState<'amount' | 'method' | 'details' | 'processing' | 'success'>('amount');
  const [selectedMethod, setSelectedMethod] = useState<WithdrawalMethod | null>(null);
  const [amount, setAmount] = useState(100);
  const [processingStep, setProcessingStep] = useState(0);
  const [bankDetails, setBankDetails] = useState({
    accountHolder: '',
    bankName: '',
    accountNumber: '',
    routingNumber: '',
  });
  
  const processingSteps = [
    'Validating withdrawal request...',
    'Converting USDC to USD...',
    'Processing withdrawal...',
    'Transferring funds...',
    'Transaction complete!',
  ];

  const usdAmount = amount * 1.002; // Simulating slight conversion rate
  const fee = selectedMethod ? (amount * parseFloat(selectedMethod.fee.replace('%', '')) / 100) : 0;
  const netAmount = amount - fee;

  const handleAmountNext = () => {
    if (amount < 10) {
      toast.error('Minimum withdrawal is 10 USDC');
      return;
    }
    if (amount > availableBalance) {
      toast.error('Insufficient balance');
      return;
    }
    setStep('method');
  };

  const handleMethodSelect = (method: WithdrawalMethod) => {
    if (amount < method.minAmount) {
      toast.error(`Minimum amount for ${method.name} is ${method.minAmount} USDC`);
      return;
    }
    setSelectedMethod(method);
    setStep('details');
  };

  const handleProcessWithdrawal = async () => {
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
      if (onSuccess) onSuccess(amount);
      toast.success('Withdrawal successful!', {
        description: `$${netAmount.toFixed(2)} will be transferred to your account`,
      });
      // Reset for next use
      setTimeout(() => {
        setStep('amount');
        setSelectedMethod(null);
        setAmount(100);
        setProcessingStep(0);
        setBankDetails({
          accountHolder: '',
          bankName: '',
          accountNumber: '',
          routingNumber: '',
        });
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
        setAmount(100);
        setProcessingStep(0);
        setBankDetails({
          accountHolder: '',
          bankName: '',
          accountNumber: '',
          routingNumber: '',
        });
      }, 300);
    }
  };

  const isFormValid = selectedMethod?.id === 'bank' 
    ? bankDetails.accountHolder && bankDetails.bankName && bankDetails.accountNumber && bankDetails.routingNumber
    : true;

  return (
    <Dialog open={open} onOpenChange={step === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'amount' && (
          <>
            <DialogHeader>
              <DialogTitle>Withdraw Funds</DialogTitle>
              <DialogDescription>
                Convert your USDC to cash and withdraw to your account
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Balance Display */}
              <Card className="bg-zinc-50 dark:bg-zinc-900">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="h-5 w-5 text-zinc-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Available Balance</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {availableBalance.toFixed(2)} USDC
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    ≈ ${(availableBalance * 1.002).toFixed(2)} USD
                  </p>
                </CardContent>
              </Card>

              {/* Amount Input */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Withdrawal Amount (USDC)</label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="number"
                    min="10"
                    max={availableBalance}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border bg-white pl-10 pr-4 py-3 text-lg font-semibold dark:bg-zinc-950"
                    placeholder="100"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Min: 10 USDC • Max: {availableBalance.toFixed(2)} USDC
                </p>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  Math.min(100, availableBalance),
                  Math.min(500, availableBalance),
                  Math.min(1000, availableBalance),
                  availableBalance
                ].map((quickAmount, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(quickAmount)}
                    disabled={quickAmount <= 0}
                    className={amount === quickAmount ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''}
                  >
                    {index === 3 ? 'Max' : `${quickAmount.toFixed(0)}`}
                  </Button>
                ))}
              </div>

              {/* Conversion Preview */}
              <Card className="bg-green-50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote className="h-5 w-5 text-green-600" />
                    <span className="font-medium">You&apos;ll receive</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    ≈ ${usdAmount.toFixed(2)} USD
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    Exchange rate: 1 USDC = 1.002 USD
                  </p>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAmountNext}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'method' && (
          <>
            <DialogHeader>
              <DialogTitle>Choose Withdrawal Method</DialogTitle>
              <DialogDescription>
                Select how you&apos;d like to receive your funds
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {withdrawalMethods.map((method) => (
                <Card
                  key={method.id}
                  className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    !method.available ? 'opacity-50 cursor-not-allowed' : ''
                  } ${amount < method.minAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => method.available && amount >= method.minAmount && handleMethodSelect(method)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <method.icon className="h-5 w-5 mt-0.5 text-zinc-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{method.name}</span>
                          {!method.available && <Badge variant="secondary">Coming Soon</Badge>}
                          {amount < method.minAmount && (
                            <Badge variant="destructive">Min: {method.minAmount} USDC</Badge>
                          )}
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
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('amount')}>
                Back
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'details' && selectedMethod && (
          <>
            <DialogHeader>
              <DialogTitle>Withdrawal Details</DialogTitle>
              <DialogDescription>
                {selectedMethod.id === 'bank' 
                  ? 'Enter your bank account details'
                  : 'Confirm your withdrawal details'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Bank Details Form */}
              {selectedMethod.id === 'bank' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Account Holder Name</label>
                    <input
                      type="text"
                      value={bankDetails.accountHolder}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, accountHolder: e.target.value }))}
                      className="w-full rounded-md border bg-white px-3 py-2 dark:bg-zinc-950"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Bank Name</label>
                    <input
                      type="text"
                      value={bankDetails.bankName}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                      className="w-full rounded-md border bg-white px-3 py-2 dark:bg-zinc-950"
                      placeholder="Chase Bank"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Number</label>
                    <input
                      type="text"
                      value={bankDetails.accountNumber}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                      className="w-full rounded-md border bg-white px-3 py-2 dark:bg-zinc-950"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Routing Number</label>
                    <input
                      type="text"
                      value={bankDetails.routingNumber}
                      onChange={(e) => setBankDetails(prev => ({ ...prev, routingNumber: e.target.value }))}
                      className="w-full rounded-md border bg-white px-3 py-2 dark:bg-zinc-950"
                      placeholder="021000021"
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              <Card className="bg-zinc-50 dark:bg-zinc-900">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Withdrawal Amount</span>
                    <span>{amount.toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Processing Fee ({selectedMethod.fee})</span>
                    <span>{fee.toFixed(2)} USDC</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>You&apos;ll receive</span>
                    <span>${netAmount.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                    <span>Processing time</span>
                    <span>{selectedMethod.processingTime}</span>
                  </div>
                </CardContent>
              </Card>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Withdrawals are processed securely and cannot be reversed once confirmed.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('method')}>
                Back
              </Button>
              <Button 
                onClick={handleProcessWithdrawal}
                disabled={!isFormValid}
              >
                <Banknote className="mr-2 h-4 w-4" />
                Confirm Withdrawal
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Withdrawal</DialogTitle>
              <DialogDescription>
                Please wait while we process your withdrawal
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-green-600" />
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
                        ? 'text-green-600 dark:text-green-400'
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
                  Expected completion: {selectedMethod?.processingTime}. Do not close this window.
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Withdrawal Successful!</DialogTitle>
              <DialogDescription>
                Your withdrawal has been processed
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
                  ${netAmount.toFixed(2)} withdrawal initiated!
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Funds will arrive in {selectedMethod?.processingTime.toLowerCase()}
                </p>
              </div>

              <Card className="p-4 bg-green-50 dark:bg-green-950/20">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Transaction ID</span>
                    <span className="font-mono text-xs">WD{Math.random().toString(16).substr(2, 8).toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Method</span>
                    <span className="font-medium">{selectedMethod?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Status</span>
                    <Badge className="bg-green-100 text-green-800">Processing</Badge>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Banknote className="h-4 w-4 text-emerald-600" />
                <span>You&apos;ll receive an email confirmation shortly</span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}