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
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Shield,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Home,
} from 'lucide-react';

interface PurchaseConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelName: string;
  unitName: string;
  unitType: string;
  tokenAmount: number;
  tokenPrice: number;
  totalPrice: number;
  roiPercentage: number;
  onConfirm: () => void;
  onSuccess?: () => void;
}

export function PurchaseConfirmationDialog({
  open,
  onOpenChange,
  hotelName,
  unitName,
  unitType,
  tokenAmount,
  tokenPrice,
  totalPrice,
  roiPercentage,
  onConfirm,
  onSuccess,
}: PurchaseConfirmationDialogProps) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [step, setStep] = useState(0);

  const processingSteps = [
    'Validating purchase details...',
    'Creating smart contract...',
    'Minting tokens...',
    'Recording on blockchain...',
    'Finalizing transaction...',
  ];

  const handleConfirm = async () => {
    setStatus('processing');
    setStep(0);

    // Simulate processing steps
    for (let i = 0; i < processingSteps.length; i++) {
      setStep(i);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    setStatus('success');
    
    // Call the original onConfirm
    onConfirm();

    // Wait a bit then close and call onSuccess
    setTimeout(() => {
      onOpenChange(false);
      if (onSuccess) onSuccess();
      // Reset state for next use
      setTimeout(() => {
        setStatus('idle');
        setStep(0);
      }, 500);
    }, 2000);
  };

  const handleCancel = () => {
    if (status === 'idle') {
      onOpenChange(false);
    }
  };

  const annualReturn = (totalPrice * roiPercentage) / 100;

  return (
    <Dialog open={open} onOpenChange={status === 'idle' ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-[500px]">
        {status === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Token Purchase</DialogTitle>
              <DialogDescription>
                Please review your investment details before confirming
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Property Details */}
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Property</span>
                  </div>
                  <div>
                    <p className="font-semibold">{hotelName}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {unitName} - Type {unitType}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Investment Summary */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Number of Tokens</span>
                  <span className="font-medium">{tokenAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Price per Token</span>
                  <span className="font-medium">${tokenPrice}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total Investment</span>
                  <span className="text-xl font-bold">${totalPrice.toLocaleString()}</span>
                </div>
              </div>

              {/* Returns Info */}
              <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-emerald-900 dark:text-emerald-100">
                  <div className="mt-1 space-y-1">
                    <p className="font-medium">Expected Annual Return: ${annualReturn.toLocaleString()}</p>
                    <p className="text-sm">{roiPercentage}% guaranteed annual returns</p>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Terms Notice */}
              <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  By confirming this purchase, you agree to the terms and conditions of the tokenization platform. 
                  Your investment will be recorded on the blockchain and tokens will be credited to your wallet.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>
                <Shield className="mr-2 h-4 w-4" />
                Confirm Purchase
              </Button>
            </DialogFooter>
          </>
        )}

        {status === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Your Purchase</DialogTitle>
              <DialogDescription>
                Please wait while we complete your transaction
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold">{Math.round((step + 1) / processingSteps.length * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {processingSteps.map((stepText, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 text-sm ${
                      index === step
                        ? 'text-blue-600 dark:text-blue-400'
                        : index < step
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-400 dark:text-zinc-600'
                    }`}
                  >
                    {index < step ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : index === step ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-current" />
                    )}
                    <span>{stepText}</span>
                  </div>
                ))}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Do not close this window or refresh the page during processing.
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Purchase Successful!</DialogTitle>
              <DialogDescription>
                Your token purchase has been completed
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
                  {tokenAmount.toLocaleString()} tokens purchased successfully!
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Transaction has been recorded on the blockchain
                </p>
              </div>

              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Transaction ID</span>
                    <span className="font-mono text-xs">0x{Math.random().toString(16).substr(2, 8)}...</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Block Number</span>
                    <span className="font-medium">{Math.floor(Math.random() * 1000000) + 1000000}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Gas Used</span>
                    <span className="font-medium">0.0021 ETH</span>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span>Your tokens are now secured in your wallet</span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}