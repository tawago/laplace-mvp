'use client';

import { useMemo, useState, type DragEventHandler } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCredentials } from '@/contexts/credentials-context';
import { useWallet } from '@/contexts/wallet-context';
import { CREDENTIAL_TYPES } from '@/lib/xrpl/credentials/types';
import { CheckCircle2, FileCheck2, Loader2, ShieldAlert, UploadCloud, FileText, X } from 'lucide-react';
import { toast } from 'sonner';

type VerificationState = 'idle' | 'processing' | 'pending-acceptance' | 'verified';

interface PendingAcceptDetails {
  issuer: string;
  credentialTypeHex: string;
}

export function VerificationCard() {
  const { address, connectionType } = useWallet();
  const { isVerified, verificationLevel, acceptCredential, refreshCredentials } = useCredentials();

  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAccept, setPendingAccept] = useState<PendingAcceptDetails | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  };

  const handlePickFile = (file: File | null) => {
    setVerificationFile(file);
  };

  const handleDragOver: DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave: DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop: DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handlePickFile(file);
  };

  const state: VerificationState = useMemo(() => {
    if (isVerified || verificationLevel === 'verified') return 'verified';
    if (isSubmitting) return 'processing';
    if (pendingAccept) return 'pending-acceptance';
    return 'idle';
  }, [isSubmitting, isVerified, pendingAccept, verificationLevel]);

  const handleSubmit = async () => {
    if (!address || connectionType === 'disconnected') {
      toast.error('Connect a wallet first');
      return;
    }

    if (!verificationFile) {
      toast.error('Upload any file to run demo verification');
      return;
    }

    setIsSubmitting(true);
    setPendingAccept(null);

    try {
      const createResponse = await fetch('/api/credentials/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectAddress: address,
          credentialType: 'KYC_VERIFIED',
        }),
      });
      const createPayload = await createResponse.json();

      if (!createResponse.ok || !createPayload.success) {
        toast.error(createPayload.error || 'Failed to create credential');
        return;
      }

      const issuer = createPayload.data?.issuer;
      const credentialTypeHex = createPayload.data?.credentialTypeHex || CREDENTIAL_TYPES.KYC_VERIFIED;
      if (typeof issuer !== 'string') {
        toast.error('Credential issuer missing from API response');
        return;
      }

      try {
        await acceptCredential(issuer, credentialTypeHex);
        await refreshCredentials();
        toast.success('Verification complete. Badge updated to Verified.');
      } catch (error) {
        setPendingAccept({ issuer, credentialTypeHex });
        toast.error(error instanceof Error ? error.message : 'Credential created. Acceptance is still pending.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryAccept = async () => {
    if (!pendingAccept) return;

    setIsSubmitting(true);
    try {
      await acceptCredential(pendingAccept.issuer, pendingAccept.credentialTypeHex);
      await refreshCredentials();
      setPendingAccept(null);
      toast.success('Pending credential accepted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept pending credential');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-5 w-5" />
          Demo Identity Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'verified' ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-10 text-center dark:border-blue-900/60 dark:bg-blue-950/20">
            <CheckCircle2 className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-400" />
            <p className="mt-4 text-2xl font-semibold tracking-tight text-blue-700 dark:text-blue-300">You are verified</p>
            <p className="mt-2 text-sm text-blue-700/80 dark:text-blue-300/80">
              Your wallet has an accepted on-chain KYC credential.
            </p>
          </div>
        ) : (
          <>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Upload any file to simulate KYC review. This issues and accepts an on-chain <span className="font-mono">KYC_VERIFIED</span>{' '}
          credential for your connected wallet.
        </p>

        <label
          className={`block cursor-pointer rounded-xl border border-dashed p-4 text-sm transition-colors md:p-6 ${
            isDragActive
              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/20'
              : 'border-zinc-300 bg-zinc-50/60 hover:bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            className="sr-only"
            onChange={(event) => {
              handlePickFile(event.target.files?.[0] ?? null);
            }}
          />

          {!verificationFile ? (
            <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
              <UploadCloud className="h-7 w-7 text-zinc-500" />
              <p className="font-medium">Drop your file here, or click to upload</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Demo mode accepts any file type</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{verificationFile.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(verificationFile.size)}</p>
                </div>
              </div>

              <button
                type="button"
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                onClick={(event) => {
                  event.preventDefault();
                  setVerificationFile(null);
                }}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {state === 'pending-acceptance' ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Pending acceptance
            </Badge>
          ) : state === 'processing' ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </Badge>
          ) : (
            <Badge variant="secondary">Unverified</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSubmit()} disabled={state === 'processing'}>
            {state === 'processing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start Verification
          </Button>

          {pendingAccept ? (
            <Button variant="outline" onClick={() => void retryAccept()} disabled={state === 'processing'}>
              Accept Pending Credential
            </Button>
            ) : null}
        </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
