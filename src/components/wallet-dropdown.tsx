'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  Copy, 
  LogOut, 
  User, 
  DollarSign,
  Shield,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

export function WalletDropdown() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const copyAddress = () => {
    navigator.clipboard.writeText(user.wallet.address);
    toast.success('Wallet address copied!');
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <div className="flex items-center gap-2">
            <Image 
              src={user.picture} 
              alt={user.name}
              width={20}
              height={20}
              className="rounded-full"
            />
            <span className="hidden sm:inline">{formatAddress(user.wallet.address)}</span>
            <span className="sm:hidden">{user.name.split(' ')[0]}</span>
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center gap-3">
            <Image 
              src={user.picture} 
              alt={user.name}
              width={40}
              height={40}
              className="rounded-full"
            />
            <div className="flex-1">
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />

        {/* Account Abstraction Badge */}
        <div className="px-2 py-1.5">
          <Badge variant="secondary" className="w-full justify-center">
            <Shield className="mr-1 h-3 w-3" />
            Smart Account
          </Badge>
        </div>

        <DropdownMenuSeparator />

        {/* Wallet Info */}
        <div className="px-2 py-2">
          <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Wallet Address</span>
              <button
                onClick={copyAddress}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 font-mono text-xs">{formatAddress(user.wallet.address)}</p>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Balance</span>
            <span className="flex items-center gap-1 font-semibold">
              <DollarSign className="h-4 w-4" />
              {user.wallet.balance.toLocaleString()}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <Link href="/portfolio" className="flex w-full items-center">
            <Wallet className="mr-2 h-4 w-4" />
            My Portfolio
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem>
          <Link href="/profile" className="flex w-full items-center">
            <User className="mr-2 h-4 w-4" />
            Profile Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}