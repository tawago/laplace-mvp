'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Chrome, Twitter, Github, Shield, Zap, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { login, isLoading } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const handleLogin = async (provider: 'google' | 'twitter' | 'github') => {
    setSelectedProvider(provider);
    try {
      await login(provider);
      toast.success('Welcome to Sheng Tai International!', {
        description: 'Your smart wallet has been created successfully.',
      });
      onOpenChange(false);
    } catch {
      toast.error('Login failed', {
        description: 'Please try again later.',
      });
    } finally {
      setSelectedProvider(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Sheng Tai International</DialogTitle>
          <DialogDescription>
            Sign in with your social account. We&apos;ll create a secure wallet for you automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Account Abstraction Info */}
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 text-blue-600" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Smart Account Technology
                </p>
                <p className="mt-1 text-blue-700 dark:text-blue-300">
                  No seed phrases or private keys needed. Your account is secured by your social login.
                </p>
              </div>
            </div>
          </div>

          {/* Login Options */}
          <div className="space-y-3">
            <Button
              className="w-full justify-start"
              variant="outline"
              size="lg"
              onClick={() => handleLogin('google')}
              disabled={isLoading}
            >
              {isLoading && selectedProvider === 'google' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Chrome className="mr-2 h-5 w-5" />
              )}
              Continue with Google
            </Button>

            <Button
              className="w-full justify-start"
              variant="outline"
              size="lg"
              onClick={() => handleLogin('twitter')}
              disabled={isLoading}
            >
              {isLoading && selectedProvider === 'twitter' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Twitter className="mr-2 h-5 w-5" />
              )}
              Continue with Twitter
            </Button>

            <Button
              className="w-full justify-start"
              variant="outline"
              size="lg"
              onClick={() => handleLogin('github')}
              disabled={isLoading}
            >
              {isLoading && selectedProvider === 'github' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Github className="mr-2 h-5 w-5" />
              )}
              Continue with GitHub
            </Button>
          </div>

          {/* Features */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Zap className="h-4 w-4" />
              <span>Instant wallet creation</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Lock className="h-4 w-4" />
              <span>Secured by multi-factor authentication</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}