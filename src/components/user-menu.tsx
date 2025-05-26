'use client';

import { useState, useEffect } from 'react';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  Copy, 
  LogOut, 
  User, 
  DollarSign,
  Shield,
  ChevronDown,
  Briefcase,
  CalendarDays,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    setIsOpen(false);
  };

  const menuItems = [
    {
      href: '/portfolio',
      icon: Briefcase,
      label: 'My Portfolio',
      description: 'View your token investments'
    },
    {
      href: '/bookings',
      icon: CalendarDays,
      label: 'My Bookings',
      description: 'Manage your reservations'
    },
    {
      href: '/wallet',
      icon: Wallet,
      label: 'Wallet',
      description: 'Manage your funds'
    },
    {
      href: '/profile',
      icon: User,
      label: 'Profile Settings',
      description: 'Account preferences'
    },
  ];

  // Mobile Sidebar
  if (isMobile) {
    return (
      <>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={() => setIsOpen(true)}
        >
          <Image 
            src={user.picture} 
            alt={user.name}
            width={20}
            height={20}
            className="rounded-full"
          />
          <span>{user.name.split(' ')[0]}</span>
        </Button>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="right" className="w-80 p-0">
            <div className="flex h-full flex-col">
              {/* Header */}
              <SheetHeader className="border-b p-6">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-left">Account</SheetTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* User Info */}
                <div className="flex items-center gap-3 text-left">
                  <Image 
                    src={user.picture} 
                    alt={user.name}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-zinc-500">{user.email}</p>
                  </div>
                </div>

                {/* Smart Account Badge */}
                <Badge variant="secondary" className="w-fit">
                  <Shield className="mr-1 h-3 w-3" />
                  Smart Account
                </Badge>
              </SheetHeader>

              {/* Wallet Info */}
              <div className="border-b p-6">
                <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Wallet Address</span>
                    <button
                      onClick={copyAddress}
                      className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="font-mono text-sm">{formatAddress(user.wallet.address)}</p>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Balance</span>
                    <span className="flex items-center gap-1 font-semibold">
                      <DollarSign className="h-4 w-4" />
                      {user.wallet.balance.toLocaleString()} USDC
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Menu */}
              <div className="flex-1 p-6">
                <div className="space-y-2">
                  {menuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <item.icon className="h-5 w-5 text-zinc-600" />
                      <div className="flex-1">
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-zinc-500">{item.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t p-6">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop Dropdown
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
            <span>{formatAddress(user.wallet.address)}</span>
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

        {menuItems.map((item) => (
          <DropdownMenuItem key={item.href}>
            <Link href={item.href} className="flex w-full items-center">
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}