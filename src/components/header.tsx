'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginDialog } from '@/components/login-dialog';
import { WalletDropdown } from '@/components/wallet-dropdown';
import { Menu, X, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-600" />
          <span className="text-xl font-bold">Sheng Tai International</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:items-center md:space-x-8">
          <Link href="/discover" className="text-sm font-medium hover:text-zinc-600 dark:hover:text-zinc-300">
            Properties
          </Link>
          <Link href="/portfolio" className="text-sm font-medium hover:text-zinc-600 dark:hover:text-zinc-300">
            Portfolio
          </Link>
          <Link href="/about" className="text-sm font-medium hover:text-zinc-600 dark:hover:text-zinc-300">
            About
          </Link>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex md:items-center md:space-x-2">
          <ThemeToggle />
          {user ? (
            <WalletDropdown />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsLoginOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="border-t md:hidden">
          <nav className="space-y-1 px-4 pb-4 pt-2">
            <Link
              href="/discover"
              className="block rounded-lg px-3 py-2 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Properties
            </Link>
            <Link
              href="/portfolio"
              className="block rounded-lg px-3 py-2 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Portfolio
            </Link>
            <Link
              href="/about"
              className="block rounded-lg px-3 py-2 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </Link>
            <div className="pt-4">
              {user ? (
                <WalletDropdown />
              ) : (
                <Button className="w-full" variant="outline" size="sm" onClick={() => setIsLoginOpen(true)}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Login Dialog */}
      <LoginDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />
    </header>
  );
}