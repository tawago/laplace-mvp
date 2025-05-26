'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Gift,
  Star,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

interface TokenHolderBenefitsProps {
  hotelId: string;
  hotelName: string;
}

export function TokenHolderBenefits({ hotelId, hotelName }: TokenHolderBenefitsProps) {
  const { user } = useAuth();
  console.log('Token benefits for:', hotelId, hotelName); // Using params

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900 dark:from-emerald-950/20 dark:to-zinc-950">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-emerald-900 dark:text-emerald-100">
            Token Holder Benefits
          </CardTitle>
          <Badge className="bg-emerald-100 text-emerald-800">Exclusive</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Free Annual Stays</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Up to 13 nights per year at this property
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Priority Booking</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Advanced reservation access and room preferences
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Member Rates</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Special rates for additional nights beyond free allocation
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              Booking Allowance
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="font-bold text-emerald-700 dark:text-emerald-300">3</div>
              <div className="text-emerald-600 dark:text-emerald-400">Bookings/Year</div>
            </div>
            <div>
              <div className="font-bold text-emerald-700 dark:text-emerald-300">7</div>
              <div className="text-emerald-600 dark:text-emerald-400">Max Nights</div>
            </div>
            <div>
              <div className="font-bold text-emerald-700 dark:text-emerald-300">10</div>
              <div className="text-emerald-600 dark:text-emerald-400">Min Tokens</div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          {user ? (
            <Link href="/bookings">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                <CalendarDays className="mr-2 h-4 w-4" />
                Book Your Stay
              </Button>
            </Link>
          ) : (
            <div className="text-center">
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">
                Connect your wallet to access booking benefits
              </p>
              <Button variant="outline" className="w-full">
                Connect Wallet
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}