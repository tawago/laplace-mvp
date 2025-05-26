'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthGuard } from '@/components/auth-guard';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Building2,
  Gift,
  Star,
  MapPin,
  Coins,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { hotels } from '@/data/hotels';

interface Booking {
  id: string;
  hotelId: string;
  hotelName: string;
  unitType: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  confirmationCode: string;
  tokensUsed: number;
  createdAt: Date;
}

interface TokenHolding {
  hotelId: string;
  hotelName: string;
  tokens: number;
  unitType: string;
}

export default function BookingsPage() {
  const { user } = useAuth();
  console.log('User for booking page:', user?.id); // User verification for AuthGuard
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<string>('');
  const [checkInDate, setCheckInDate] = useState<Date>();
  const [checkOutDate, setCheckOutDate] = useState<Date>();
  const [guests, setGuests] = useState(2);
  const [bookingsThisYear, setBookingsThisYear] = useState(1);
  
  const remainingBookings = 3 - bookingsThisYear;

  useEffect(() => {
    // Mock token holdings data
    const mockHoldings: TokenHolding[] = [
      {
        hotelId: 'the-sail',
        hotelName: 'THE SAIL Hotel Tower',
        tokens: 50,
        unitType: 'Studio Deluxe',
      },
      {
        hotelId: 'nyra',
        hotelName: 'NYRA Oceanview Hotel',
        tokens: 100,
        unitType: 'Premium Suite',
      },
    ];
    setTokenHoldings(mockHoldings);

    // Mock existing bookings
    const mockBookings: Booking[] = [
      {
        id: '1',
        hotelId: 'the-sail',
        hotelName: 'THE SAIL Hotel Tower',
        unitType: 'Studio Deluxe',
        checkIn: new Date('2024-08-15'),
        checkOut: new Date('2024-08-18'),
        guests: 2,
        status: 'confirmed',
        confirmationCode: 'ST240815',
        tokensUsed: 10,
        createdAt: new Date('2024-07-20'),
      },
    ];
    setBookings(mockBookings);
  }, []);

  const handleBookingSubmit = () => {
    if (!checkInDate || !checkOutDate || !selectedHotel) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (remainingBookings <= 0) {
      toast.error('You have reached your annual booking limit of 3 reservations');
      return;
    }

    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    if (nights > 7) {
      toast.error('Maximum stay is 7 nights per reservation');
      return;
    }

    const selectedHotelData = hotels.find(h => h.id === selectedHotel);
    const holding = tokenHoldings.find(h => h.hotelId === selectedHotel);
    
    if (!holding || holding.tokens < 10) {
      toast.error('You need at least 10 tokens to make a reservation');
      return;
    }

    const newBooking: Booking = {
      id: Date.now().toString(),
      hotelId: selectedHotel,
      hotelName: selectedHotelData?.name || '',
      unitType: holding.unitType,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests,
      status: 'pending',
      confirmationCode: `ST${Date.now().toString().slice(-6)}`,
      tokensUsed: nights * 2, // 2 tokens per night
      createdAt: new Date(),
    };

    setBookings(prev => [newBooking, ...prev]);
    setBookingsThisYear(prev => prev + 1);
    setShowBookingDialog(false);
    
    // Reset form
    setSelectedHotel('');
    setCheckInDate(undefined);
    setCheckOutDate(undefined);
    setGuests(2);

    toast.success('Booking request submitted successfully!', {
      description: `Confirmation code: ${newBooking.confirmationCode}`,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-emerald-100 text-emerald-800">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDateRange = (checkIn: Date, checkOut: Date) => {
    const options: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric',
      year: checkIn.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    };
    return `${checkIn.toLocaleDateString('en-US', options)} - ${checkOut.toLocaleDateString('en-US', options)}`;
  };

  const calculateNights = (checkIn: Date, checkOut: Date) => {
    return Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        {/* Header */}
        <div className="border-b bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Reserve your stays using your token holder benefits
                </p>
              </div>
              
              <Button 
                onClick={() => setShowBookingDialog(true)}
                disabled={remainingBookings <= 0}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                New Booking
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          {/* Benefits Overview */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Annual Bookings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{remainingBookings}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">remaining</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {bookingsThisYear} of 3 used this year
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div 
                    className="h-full bg-blue-500"
                    style={{ width: `${(bookingsThisYear / 3) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Token Holdings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{tokenHoldings.reduce((sum, h) => sum + h.tokens, 0)}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">tokens</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Across {tokenHoldings.length} properties
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Free Nights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">13</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">nights/year</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Per token holding
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Member Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="font-medium">Gold Member</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Token holder benefits
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="bookings" className="space-y-6">
            <TabsList>
              <TabsTrigger value="bookings">My Bookings</TabsTrigger>
              <TabsTrigger value="holdings">Token Holdings</TabsTrigger>
              <TabsTrigger value="benefits">Benefits</TabsTrigger>
            </TabsList>

            <TabsContent value="bookings" className="space-y-4">
              {bookings.length > 0 ? (
                bookings.map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                            <Building2 className="h-6 w-6 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{booking.hotelName}</h3>
                              {getStatusBadge(booking.status)}
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              {booking.unitType}
                            </p>
                            <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500">
                              <div className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                <span>{formatDateRange(booking.checkIn, booking.checkOut)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>{calculateNights(booking.checkIn, booking.checkOut)} nights</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                <span>{booking.guests} guests</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-medium">{booking.confirmationCode}</p>
                          <p className="text-xs text-zinc-500">
                            {booking.tokensUsed} tokens used
                          </p>
                          {booking.status === 'confirmed' && (
                            <Button variant="outline" size="sm" className="mt-2">
                              View Details
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CalendarDays className="mx-auto h-12 w-12 text-zinc-400" />
                    <h3 className="mt-4 text-lg font-medium">No bookings yet</h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Start exploring your token holder benefits by making your first reservation
                    </p>
                    <Button className="mt-4" onClick={() => setShowBookingDialog(true)}>
                      Make Your First Booking
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="holdings" className="space-y-4">
              {tokenHoldings.map((holding) => {
                const hotel = hotels.find(h => h.id === holding.hotelId);
                return (
                  <Card key={holding.hotelId}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                            <Coins className="h-6 w-6 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{holding.hotelName}</h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              {holding.unitType}
                            </p>
                            <div className="mt-2 flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Coins className="h-4 w-4 text-emerald-600" />
                                <span className="font-medium">{holding.tokens} tokens</span>
                              </div>
                              {hotel && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-4 w-4 text-zinc-500" />
                                  <span className="text-zinc-500">{hotel.location}, {hotel.country}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedHotel(holding.hotelId);
                            setShowBookingDialog(true);
                          }}
                          disabled={holding.tokens < 10}
                        >
                          Book Stay
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="benefits" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-purple-600" />
                      Token Holder Benefits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Free Annual Stays</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Up to 13 nights per year, per token holding
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Priority Booking</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Advanced booking access and room preferences
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-medium">Member Rates</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Special rates on additional nights beyond free allocation
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-blue-600" />
                      Booking Guidelines
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm space-y-2">
                      <p><strong>Annual Limit:</strong> 3 separate bookings per year</p>
                      <p><strong>Maximum Stay:</strong> 7 nights per booking</p>
                      <p><strong>Token Requirement:</strong> Minimum 10 tokens to book</p>
                      <p><strong>Advance Notice:</strong> Book at least 7 days in advance</p>
                      <p><strong>Cancellation:</strong> Free cancellation up to 48 hours before check-in</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Booking Request</DialogTitle>
              <DialogDescription>
                Reserve your stay using your token holder benefits ({remainingBookings} bookings remaining this year)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Hotel Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Property</label>
                <Select value={selectedHotel} onValueChange={setSelectedHotel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {tokenHoldings.map((holding) => (
                      <SelectItem key={holding.hotelId} value={holding.hotelId}>
                        <div className="flex items-center gap-2">
                          <span>{holding.hotelName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {holding.tokens} tokens
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Selection */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Check-in Date</label>
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={checkInDate}
                        onSelect={setCheckInDate}
                        disabled={(date) => date < new Date()}
                        className="rounded-md border"
                        classNames={{
                          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                          month: "space-y-4",
                          caption: "flex justify-center pt-1 relative items-center",
                          caption_label: "text-sm font-medium",
                          nav: "space-x-1 flex items-center",
                          nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                          nav_button_previous: "absolute left-1",
                          nav_button_next: "absolute right-1",
                          table: "w-full border-collapse space-y-1",
                          head_row: "flex",
                          head_cell: "text-zinc-500 rounded-md w-8 font-normal text-[0.8rem]",
                          row: "flex w-full mt-2",
                          cell: "text-center text-sm relative p-0 focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-zinc-100 [&:has([aria-selected].day-outside)]:bg-zinc-100/50 [&:has([aria-selected])]:rounded-md",
                          day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-zinc-100 hover:rounded-md",
                          day_selected: "bg-zinc-900 text-zinc-50 hover:bg-zinc-900 hover:text-zinc-50 focus:bg-zinc-900 focus:text-zinc-50",
                          day_today: "bg-zinc-100 text-zinc-900",
                          day_outside: "text-zinc-500 opacity-50",
                          day_disabled: "text-zinc-500 opacity-50",
                          day_range_middle: "aria-selected:bg-zinc-100 aria-selected:text-zinc-900",
                          day_hidden: "invisible",
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Check-out Date</label>
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={checkOutDate}
                        onSelect={setCheckOutDate}
                        disabled={(date) => !checkInDate || date <= checkInDate}
                        className="rounded-md border"
                        classNames={{
                          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                          month: "space-y-4",
                          caption: "flex justify-center pt-1 relative items-center",
                          caption_label: "text-sm font-medium",
                          nav: "space-x-1 flex items-center",
                          nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                          nav_button_previous: "absolute left-1",
                          nav_button_next: "absolute right-1",
                          table: "w-full border-collapse space-y-1",
                          head_row: "flex",
                          head_cell: "text-zinc-500 rounded-md w-8 font-normal text-[0.8rem]",
                          row: "flex w-full mt-2",
                          cell: "text-center text-sm relative p-0 focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-zinc-100 [&:has([aria-selected].day-outside)]:bg-zinc-100/50 [&:has([aria-selected])]:rounded-md",
                          day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-zinc-100 hover:rounded-md",
                          day_selected: "bg-zinc-900 text-zinc-50 hover:bg-zinc-900 hover:text-zinc-50 focus:bg-zinc-900 focus:text-zinc-50",
                          day_today: "bg-zinc-100 text-zinc-900",
                          day_outside: "text-zinc-500 opacity-50",
                          day_disabled: "text-zinc-500 opacity-50",
                          day_range_middle: "aria-selected:bg-zinc-100 aria-selected:text-zinc-900",
                          day_hidden: "invisible",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Guests */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Number of Guests</label>
                <Select value={guests.toString()} onValueChange={(value) => setGuests(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? 'Guest' : 'Guests'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Booking Summary */}
              {checkInDate && checkOutDate && selectedHotel && (
                <Card className="bg-blue-50 dark:bg-blue-950/20">
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Booking Summary</h4>
                    <div className="space-y-1 text-sm">
                      <p>Property: {tokenHoldings.find(h => h.hotelId === selectedHotel)?.hotelName}</p>
                      <p>Dates: {formatDateRange(checkInDate, checkOutDate)}</p>
                      <p>Nights: {calculateNights(checkInDate, checkOutDate)}</p>
                      <p>Guests: {guests}</p>
                      <p className="font-medium text-blue-600">
                        Tokens required: {calculateNights(checkInDate, checkOutDate) * 2}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleBookingSubmit}
                disabled={!checkInDate || !checkOutDate || !selectedHotel || remainingBookings <= 0}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Submit Booking Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}