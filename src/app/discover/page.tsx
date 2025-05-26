'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowRight, 
  Building2, 
  MapPin, 
  TrendingUp, 
  Filter,
  ChevronDown
} from 'lucide-react';
import { hotels } from '@/data/hotels';

export default function DiscoverPage() {
  const [selectedROI, setSelectedROI] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filteredHotels = hotels.filter(hotel => {
    if (selectedROI !== 'all') {
      if (selectedROI === 'high' && hotel.roiPercentage < 8) return false;
      if (selectedROI === 'medium' && hotel.roiPercentage >= 8) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Page Header */}
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Investment Properties
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Discover premium tokenized hotel opportunities
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Filter Toggle */}
      <div className="sticky top-16 z-40 border-b bg-white dark:bg-zinc-950 md:hidden">
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className={`${isFilterOpen ? 'block' : 'hidden'} border-b bg-white dark:bg-zinc-950 md:block`}>
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="text-sm font-medium">Filters:</span>
              
              {/* ROI Filter */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={selectedROI === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedROI('all')}
                >
                  All ROI
                </Button>
                <Button
                  size="sm"
                  variant={selectedROI === 'high' ? 'default' : 'outline'}
                  onClick={() => setSelectedROI('high')}
                >
                  8% ROI
                </Button>
                <Button
                  size="sm"
                  variant={selectedROI === 'medium' ? 'default' : 'outline'}
                  onClick={() => setSelectedROI('medium')}
                >
                  5-7% ROI
                </Button>
              </div>
            </div>

            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {filteredHotels.length} properties available
            </div>
          </div>
        </div>
      </div>

      {/* Hotel Grid */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredHotels.map((hotel) => {
            const soldPercentage = ((hotel.totalUnits - hotel.availableUnits) / hotel.totalUnits) * 100;
            
            return (
              <Card key={hotel.id} className="group overflow-hidden transition-all hover:shadow-xl">
                <CardHeader className="p-0">
                  <div className="aspect-[16/10] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                    <div className="flex h-full items-center justify-center">
                      <Building2 className="h-12 w-12 text-zinc-400" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Hotel Info */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between">
                      <h3 className="text-lg font-bold">{hotel.name}</h3>
                      <Badge variant="secondary" className="ml-2">
                        {hotel.roiGuaranteed}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin className="mr-1 h-3 w-3" />
                      {hotel.location}, {hotel.country}
                    </p>
                  </div>

                  {/* Key Metrics */}
                  <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-500">Min. Investment</p>
                      <p className="font-semibold">${hotel.minInvestment}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Token Price</p>
                      <p className="font-semibold">${hotel.tokenPrice}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {hotel.availableUnits} units available
                      </span>
                      <span className="font-medium">{soldPercentage.toFixed(0)}% sold</span>
                    </div>
                    <Progress value={soldPercentage} className="h-2" />
                  </div>

                  {/* Features */}
                  <div className="mb-6 flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      {hotel.buybackPercentage}% buyback
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Year {hotel.buybackYear}
                    </Badge>
                  </div>

                  {/* CTA */}
                  <Link href={`/hotel/${hotel.id}`}>
                    <Button className="w-full" variant="default">
                      View Details
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}