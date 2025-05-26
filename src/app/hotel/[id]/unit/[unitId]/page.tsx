'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { HotelImage } from '@/components/hotel-image';
import { ImageGallery } from '@/components/image-gallery';
import { 
  ArrowLeft,
  Bed,
  Bath,
  Maximize,
  Eye,
  Users,
  Wifi,
  AirVent,
  Tv,
  Coffee,
  Shield,
  TrendingUp,
  Calendar,
  DollarSign,
  Calculator,
  ChevronRight,
  Home
} from 'lucide-react';
import { hotels } from '@/data/hotels';

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const hotel = hotels.find(h => h.id === params.id);
  const unit = hotel?.units.find(u => u.id === params.unitId);
  
  const [tokenAmount, setTokenAmount] = useState(100);
  const [investmentYears, setInvestmentYears] = useState(5);

  if (!hotel || !unit) {
    return <div>Unit not found</div>;
  }

  const tokenPrice = hotel.tokenPrice;
  const investmentAmount = tokenAmount * tokenPrice;
  const annualReturn = investmentAmount * (hotel.roiPercentage / 100);
  const totalReturns = annualReturn * investmentYears;
  const totalValue = investmentAmount + totalReturns;
  const buybackValue = investmentAmount * (hotel.buybackPercentage / 100);

  // Mock unit images
  const unitImages = [
    `/images/${hotel.id}-unit-1.jpg`,
    `/images/${hotel.id}-unit-2.jpg`,
    `/images/${hotel.id}-unit-3.jpg`,
    `/images/${hotel.id}-unit-4.jpg`,
  ];

  const amenities = [
    { icon: Wifi, name: 'High-Speed WiFi' },
    { icon: AirVent, name: 'Air Conditioning' },
    { icon: Tv, name: 'Smart TV' },
    { icon: Coffee, name: 'Coffee Maker' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Link href={`/hotel/${hotel.id}`} className="hover:text-zinc-900 dark:hover:text-white">
                  {hotel.name}
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span>Unit Details</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold">{unit.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Image */}
      <div className="relative h-[40vh] min-h-[300px] overflow-hidden">
        <HotelImage 
          src={unitImages[0]} 
          alt={unit.name}
          className="brightness-90"
          fallbackClassName="bg-zinc-200 dark:bg-zinc-800"
        />
        <div className="absolute bottom-4 left-4 right-4 flex justify-between">
          <Badge className="bg-white/90 text-black">{unit.type}</Badge>
          <Badge className="bg-white/90 text-black">
            {unit.availableTokens.toLocaleString()} tokens available
          </Badge>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Key Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Maximize className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Size</p>
                  <p className="font-semibold">{unit.size} {unit.sizeUnit}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">View</p>
                  <p className="font-semibold">{unit.view}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Price</p>
                  <p className="font-semibold">${unit.totalPrice.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Price/m²</p>
                  <p className="font-semibold">${unit.pricePerSqm}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="details" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="investment">Investment</TabsTrigger>
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Unit Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-4 font-semibold">Room Features</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Bed className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="font-medium">Sleeping Arrangement</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {unit.type === 'Studio' ? '1 King Bed' : 
                             unit.type === 'Suite' ? '1 King Bed + Sofa Bed' : 
                             '2 Queen Beds'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Bath className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="font-medium">Bathroom</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {unit.type === 'Suite' ? 'Separate shower and bathtub' : 'Shower/tub combination'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="font-medium">Maximum Occupancy</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {unit.type === 'Studio' ? '2 guests' : 
                             unit.type === 'Suite' ? '4 guests' : 
                             '3 guests'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-4 font-semibold">Amenities</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {amenities.map((amenity, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <amenity.icon className="h-4 w-4 text-zinc-500" />
                          <span className="text-sm">{amenity.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="mb-4 font-semibold">View Description</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {unit.view === 'Ocean View' && 
                      'Enjoy breathtaking panoramic views of the ocean from your private balcony. Watch the sunrise over the water and enjoy the calming sounds of the waves.'}
                    {unit.view === 'City View' && 
                      'Take in the vibrant city skyline from your room. Perfect for those who love the energy of urban life with stunning views of the cityscape, especially beautiful at night.'}
                    {unit.view === 'Garden View' && 
                      'Overlook our beautifully landscaped tropical gardens. A peaceful retreat with lush greenery and colorful flora visible from your window.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Unit Gallery</CardTitle>
              </CardHeader>
              <CardContent>
                <ImageGallery images={unitImages} hotelName={`${hotel.name} - ${unit.name}`} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="investment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Investment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-zinc-500">Unit Value</p>
                      <p className="text-2xl font-bold">${unit.totalPrice.toLocaleString()}</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        ${unit.pricePerSqm} per m²
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-zinc-500">Token Information</p>
                      <p className="font-medium">{unit.totalTokens.toLocaleString()} total tokens</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        ${tokenPrice} per token
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-zinc-500">Availability</p>
                      <p className="font-medium">{unit.availableTokens.toLocaleString()} tokens available</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div 
                          className="h-full bg-blue-500"
                          style={{ width: `${(unit.availableTokens / unit.totalTokens) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {((unit.availableTokens / unit.totalTokens) * 100).toFixed(1)}% available
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/20">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                        <p className="font-semibold">Guaranteed Returns</p>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-emerald-600">
                        {hotel.roiGuaranteed}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Annual returns guaranteed
                      </p>
                    </div>

                    <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        <p className="font-semibold">Buyback Option</p>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-blue-600">
                        {hotel.buybackPercentage}%
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        In year {hotel.buybackYear}
                      </p>
                    </div>

                    <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-950/20">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-purple-600" />
                        <p className="font-semibold">Free Stays</p>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-purple-600">
                        13 nights
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Per year for investors
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calculator" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Investment Calculator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 flex items-center justify-between text-sm font-medium">
                      <span>Number of Tokens</span>
                      <span className="font-normal text-zinc-500">{tokenAmount.toLocaleString()} tokens</span>
                    </label>
                    <Slider
                      value={[tokenAmount]}
                      onValueChange={(value) => setTokenAmount(value[0])}
                      min={1}
                      max={unit.availableTokens}
                      step={1}
                      className="mb-2"
                    />
                    <p className="text-xs text-zinc-500">
                      Max: {unit.availableTokens.toLocaleString()} tokens
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center justify-between text-sm font-medium">
                      <span>Investment Period</span>
                      <span className="font-normal text-zinc-500">{investmentYears} years</span>
                    </label>
                    <Slider
                      value={[investmentYears]}
                      onValueChange={(value) => setInvestmentYears(value[0])}
                      min={1}
                      max={10}
                      step={1}
                      className="mb-2"
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-100 p-6 dark:bg-zinc-800">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold">
                    <Calculator className="h-5 w-5" />
                    Investment Summary
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Initial Investment</span>
                      <span className="font-medium">${investmentAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Annual Return ({hotel.roiPercentage}%)</span>
                      <span className="font-medium">${annualReturn.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Total Returns ({investmentYears} years)</span>
                      <span className="font-medium text-emerald-600">+${totalReturns.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total Value</span>
                        <span>${totalValue.toFixed(2)}</span>
                      </div>
                    </div>
                    {investmentYears >= hotel.buybackYear && (
                      <div className="border-t pt-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            Buyback Value (Year {hotel.buybackYear})
                          </span>
                          <span className="font-medium text-blue-600">${buybackValue.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Button className="w-full" size="lg" asChild>
                  <Link href={`/hotel/${hotel.id}?unit=${unit.id}&tokens=${tokenAmount}`}>
                    Purchase {tokenAmount} Tokens
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}