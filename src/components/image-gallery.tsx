'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ImageGalleryProps {
  images: string[];
  hotelName: string;
}

export function ImageGallery({ images, hotelName }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const nextImage = () => {
    setSelectedImage((prev) => (prev + 1) % images.length);
  };

  const previousImage = () => {
    setSelectedImage((prev) => (prev - 1 + images.length) % images.length);
  };

  // Mock images with placeholders
  const mockImages = [
    { url: '/images/hotel-exterior.jpg', alt: 'Hotel Exterior View' },
    { url: '/images/hotel-lobby.jpg', alt: 'Luxury Lobby' },
    { url: '/images/hotel-room.jpg', alt: 'Premium Room' },
    { url: '/images/hotel-pool.jpg', alt: 'Infinity Pool' },
    { url: '/images/hotel-restaurant.jpg', alt: 'Fine Dining Restaurant' },
    { url: '/images/hotel-view.jpg', alt: 'Ocean View' }
  ];

  return (
    <>
      <div className="space-y-4">
        {/* Main Image */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-6xl font-bold text-zinc-400">{selectedImage + 1}</p>
              <p className="mt-2 text-sm text-zinc-500">{mockImages[selectedImage].alt}</p>
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
            onClick={previousImage}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
            onClick={nextImage}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>

          {/* Fullscreen Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 bg-black/50 text-white hover:bg-black/70"
            onClick={() => setIsFullscreen(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-4 rounded-lg bg-black/50 px-3 py-1 text-sm text-white">
            {selectedImage + 1} / {mockImages.length}
          </div>
        </div>

        {/* Thumbnail Grid */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {mockImages.map((image, index) => (
            <Card
              key={index}
              className={`cursor-pointer overflow-hidden transition-all ${
                selectedImage === index ? 'ring-2 ring-blue-600' : 'hover:ring-2 hover:ring-zinc-300'
              }`}
              onClick={() => setSelectedImage(index)}
            >
              <div className="aspect-square bg-zinc-200 dark:bg-zinc-800">
                <div className="flex h-full items-center justify-center">
                  <p className="text-2xl font-bold text-zinc-400">{index + 1}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] p-0">
          <div className="relative aspect-[16/9] bg-zinc-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-8xl font-bold text-zinc-600">{selectedImage + 1}</p>
                <p className="mt-4 text-lg text-zinc-500">{mockImages[selectedImage].alt}</p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 text-white hover:bg-white/20"
              onClick={() => setIsFullscreen(false)}
            >
              <X className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
              onClick={previousImage}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
              onClick={nextImage}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/50 px-4 py-2 text-white">
              {selectedImage + 1} / {mockImages.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}