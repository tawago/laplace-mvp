'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ImageGallery } from '@/components/image-gallery';
import { HotelImage } from '@/components/hotel-image';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  Shield, 
  Calendar,
  DollarSign,
  Home,
  Maximize,
  Eye,
  Check,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { hotels } from '@/data/hotels';
import { HotelUnit } from '@/types/hotel';

export default function HotelPage() {
  const params = useParams();
  const hotel = hotels.find(h => h.id === params.id);
  
  const [selectedUnit, setSelectedUnit] = useState<HotelUnit | null>(null);
  const [tokenAmount, setTokenAmount] = useState(100);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  if (!hotel) {
    return <div>Hotel not found</div>;
  }

  const handleUnitSelect = (unit: HotelUnit) => {
    setSelectedUnit(unit);
    setTokenAmount(100);
    setIsSheetOpen(true);
  };

  const handleCheckout = () => {
    setIsSheetOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleConfirmPurchase = () => {
    setIsCheckoutOpen(false);
    toast.success('Token purchase confirmed!', {
      description: `You&apos;ve successfully purchased ${tokenAmount} tokens for ${selectedUnit?.name}.`,
    });
  };

  const subtotal = selectedUnit ? tokenAmount * hotel.tokenPrice : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Hero Section */}
      <div className="relative h-[40vh] min-h-[300px] overflow-hidden md:h-[50vh]">
        <HotelImage 
          src={hotel.thumbnail} 
          alt={hotel.name}
          className="brightness-75"
          fallbackClassName="bg-zinc-200 dark:bg-zinc-800"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Badge className="mb-2">{hotel.location}, {hotel.country}</Badge>
            <h1 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              {hotel.name}
            </h1>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="sticky top-16 z-30 border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Guaranteed ROI</p>
              <p className="text-lg font-bold">{hotel.roiGuaranteed}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Buyback Option</p>
              <p className="text-lg font-bold">{hotel.buybackPercentage}% Year {hotel.buybackYear}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Token Price</p>
              <p className="text-lg font-bold">${hotel.tokenPrice}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Available Units</p>
              <p className="text-lg font-bold">{hotel.availableUnits}/{hotel.totalUnits}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-4 text-xl font-bold">About This Property</h2>
                <p className="mb-6 text-zinc-600 dark:text-zinc-400">
                  {hotel.description}
                </p>
                
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-3 font-semibold">Key Features</h3>
                    <ul className="space-y-2">
                      {hotel.features.map((feature, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <Check className="mr-2 h-4 w-4 text-emerald-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="mb-3 font-semibold">Investment Highlights</h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <TrendingUp className="mt-0.5 h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-medium">Guaranteed Returns</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {hotel.roiGuaranteed} annual returns
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Shield className="mt-0.5 h-5 w-5 text-emerald-500" />
                        <div>
                          <p className="font-medium">Buyback Protection</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {hotel.buybackPercentage}% buyback in year {hotel.buybackYear}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Calendar className="mt-0.5 h-5 w-5 text-purple-500" />
                        <div>
                          <p className="font-medium">Free Annual Stays</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            13 nights per year for investors
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-6 text-xl font-bold">Property Gallery</h2>
                <ImageGallery images={hotel.images} hotelName={hotel.name} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="units" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-6 text-xl font-bold">Available Unit Types</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm">
                        <th className="pb-3 pr-4">Type</th>
                        <th className="pb-3 pr-4">Name</th>
                        <th className="pb-3 pr-4">Size</th>
                        <th className="pb-3 pr-4">Price</th>
                        <th className="pb-3 pr-4">Available</th>
                        <th className="pb-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {hotel.units.map((unit) => {
                        const availablePercentage = (unit.availableTokens / unit.totalTokens) * 100;
                        
                        return (
                          <tr key={unit.id} className="text-sm">
                            <td className="py-4 pr-4">
                              <Badge variant="outline">{unit.type}</Badge>
                            </td>
                            <td className="py-4 pr-4 font-medium">{unit.name}</td>
                            <td className="py-4 pr-4">
                              {unit.size} {unit.sizeUnit}
                            </td>
                            <td className="py-4 pr-4">
                              <div>
                                <p className="font-semibold">${unit.totalPrice.toLocaleString()}</p>
                                <p className="text-xs text-zinc-500">
                                  ${unit.pricePerSqm}/m²
                                </p>
                              </div>
                            </td>
                            <td className="py-4 pr-4">
                              <div>
                                <p className="font-medium">{availablePercentage.toFixed(0)}%</p>
                                <p className="text-xs text-zinc-500">
                                  {unit.availableTokens.toLocaleString()} tokens
                                </p>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex gap-2">
                                <Link href={`/hotel/${hotel.id}/unit/${unit.id}`}>
                                  <Button size="sm" variant="outline">
                                    <Info className="mr-1 h-3 w-3" />
                                    Details
                                  </Button>
                                </Link>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleUnitSelect(unit)}
                                  disabled={unit.availableTokens === 0}
                                >
                                  Buy Tokens
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="faq" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-6 text-xl font-bold">Frequently Asked Questions</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 font-semibold">What is tokenization?</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Tokenization divides property ownership into digital tokens on the blockchain, 
                      allowing fractional investment with full transparency and security.
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">How do I receive returns?</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Returns are automatically distributed to your wallet quarterly. 
                      The {hotel.roiGuaranteed} is guaranteed regardless of hotel occupancy.
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">What about the buyback guarantee?</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      You can sell your tokens back at {hotel.buybackPercentage}% of the purchase price 
                      in year {hotel.buybackYear}, providing a clear exit strategy.
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">Are there any additional fees?</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      No maintenance or management fees during the guaranteed return period. 
                      All costs are covered by the hotel operator.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Unit Purchase Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
          <div className="p-6">
            <SheetHeader className="mb-6">
              <SheetTitle>Purchase Tokens</SheetTitle>
              <SheetDescription>
                Select the number of tokens you want to purchase
              </SheetDescription>
            </SheetHeader>
          
          {selectedUnit && (
            <div className="space-y-6">
              <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <h3 className="font-semibold">{selectedUnit.name}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Home className="h-4 w-4 text-zinc-500" />
                    <span>Type {selectedUnit.type}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Maximize className="h-4 w-4 text-zinc-500" />
                    <span>{selectedUnit.size} {selectedUnit.sizeUnit}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-zinc-500" />
                    <span>{selectedUnit.view}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-zinc-500" />
                    <span>${selectedUnit.totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Number of Tokens
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedUnit.availableTokens}
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border bg-white px-3 py-2 dark:bg-zinc-950"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Max: {selectedUnit.availableTokens.toLocaleString()} tokens
                </p>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span>Token Price</span>
                  <span>${hotel.tokenPrice}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Quantity</span>
                  <span>{tokenAmount}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>

              <Button 
                className="w-full" 
                onClick={handleCheckout}
                disabled={tokenAmount < 1 || tokenAmount > selectedUnit.availableTokens}
              >
                Proceed to Checkout
              </Button>
            </div>
          )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              Review your token purchase details
            </DialogDescription>
          </DialogHeader>
          
          {selectedUnit && (
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <h3 className="font-semibold">{hotel.name}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedUnit.name} - Type {selectedUnit.type}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tokens</span>
                  <span>{tokenAmount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Price per Token</span>
                  <span>${hotel.tokenPrice}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total Amount</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
                <p className="text-sm">
                  <strong>Expected Annual Return:</strong> ${(subtotal * hotel.roiPercentage / 100).toFixed(2)}
                </p>
              </div>

              <Button className="w-full" onClick={handleConfirmPurchase}>
                Confirm Purchase
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}