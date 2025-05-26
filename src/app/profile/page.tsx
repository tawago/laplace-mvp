'use client';

import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Mail, User, Copy, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/');
    return null;
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(user.wallet.address);
    toast.success('Wallet address copied!');
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold">Profile Settings</h1>

        <div className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <img 
                  src={user.picture} 
                  alt={user.name}
                  className="h-20 w-20 rounded-full"
                />
                <div>
                  <h2 className="text-xl font-semibold">{user.name}</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Email</p>
                    <p className="font-medium">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Name</p>
                    <p className="font-medium">{user.name}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Smart Account Details
                <Badge variant="secondary">
                  <Shield className="mr-1 h-3 w-3" />
                  Account Abstraction
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Wallet Address</span>
                  <button
                    onClick={copyAddress}
                    className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="font-mono text-sm">{user.wallet.address}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-zinc-500">Balance</p>
                  <p className="text-xl font-semibold">${user.wallet.balance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Network</p>
                  <p className="text-xl font-semibold">Ethereum</p>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Smart Account Benefits:</strong>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-700 dark:text-blue-300">
                  <li>• No seed phrases to remember</li>
                  <li>• Social recovery options</li>
                  <li>• Multi-factor authentication</li>
                  <li>• Gas fees abstraction</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Account Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                onClick={handleLogout}
                className="w-full sm:w-auto"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}