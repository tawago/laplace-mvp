'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Building2, Shield, TrendingUp, Users, Sparkles } from 'lucide-react';
import { hotels } from '@/data/hotels';
import { useAuth } from '@/contexts/auth-context';
import { NewsSection } from '@/components/news-section';
import { HotelImage } from '@/components/hotel-image';
import { LuxuryCanvasBackground } from '@/components/luxury-canvas-background';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* Hero Section - Mobile First */}
      <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <LuxuryCanvasBackground />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-emerald-600/10" />
        <div className="relative mx-auto max-w-7xl">
          <div className="text-center">
            {user ? (
              <Badge className="mb-4 px-3 py-1" variant="default">
                <Sparkles className="mr-1 h-3 w-3" />
                Welcome back, {user.name.split(' ')[0]}!
              </Badge>
            ) : (
              <Badge className="mb-4 px-3 py-1" variant="secondary">
                Blockchain-Powered Real Estate
              </Badge>
            )}
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
              Own Premium Hotels
              <span className="block bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">
                One Token at a Time
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
              Invest in luxury Malaysian hotels with guaranteed returns up to 8% p.a. 
              Start from just $500 with full buyback protection.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link href="/discover">
                <Button size="lg" className="w-full sm:w-auto">
                  Start Investing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/about">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators Section */}
      <section className="border-y bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            <div>
              <p className="text-3xl font-bold text-blue-600 sm:text-4xl">RM 100B</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">M-WEZ Investment Target</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600 sm:text-4xl">12+ Years</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Market Experience</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-purple-600 sm:text-4xl">5 Countries</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Global Presence</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-orange-600 sm:text-4xl">Zero Debt</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Financial Stability</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid - Mobile Optimized */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="group transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mb-2 font-semibold">Guaranteed Returns</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Up to 8% annual returns, paid regardless of occupancy
                </p>
              </CardContent>
            </Card>

            <Card className="group transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                  <Shield className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="mb-2 font-semibold">Buyback Protection</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  100-170% buyback options from year 9 onwards
                </p>
              </CardContent>
            </Card>

            <Card className="group transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="mb-2 font-semibold">Prime Locations</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Strategic locations in Malaysia&apos;s tourism hotspots
                </p>
              </CardContent>
            </Card>

            <Card className="group transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                  <Users className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="mb-2 font-semibold">Full Support</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Complete management and multi-language assistance
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Hotels - Mobile Cards */}
      <section className="bg-zinc-50 px-4 py-16 dark:bg-zinc-900/50 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
              Featured Investment Properties
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Premium hotels in Malaysia&apos;s Melaka Waterfront Economic Zone
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            {hotels.map((hotel) => (
              <Card key={hotel.id} className="group overflow-hidden transition-all hover:shadow-xl">
                <div className="relative aspect-[16/9] overflow-hidden">
                  <HotelImage 
                    src={hotel.thumbnail} 
                    alt={hotel.name}
                    className="group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <CardContent className="p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">{hotel.name}</h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {hotel.location}, {hotel.country}
                      </p>
                    </div>
                    <Badge variant="secondary">{hotel.roiGuaranteed}</Badge>
                  </div>
                  
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {hotel.description}
                  </p>

                  <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-500">Min. Investment</p>
                      <p className="font-semibold">${hotel.minInvestment}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Buyback</p>
                      <p className="font-semibold">{hotel.buybackPercentage}% Year {hotel.buybackYear}</p>
                    </div>
                  </div>

                  <Link href={`/hotel/${hotel.id}`}>
                    <Button className="w-full" variant="outline">
                      View Details
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* News Section */}
      <NewsSection />

      {/* CTA Section */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
            Ready to Start Your Investment Journey?
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Join thousands of investors already earning guaranteed returns
          </p>
          <div className="mt-10">
            <Link href="/discover">
              <Button size="lg" className="px-8">
                Browse All Properties
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}