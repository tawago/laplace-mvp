'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Building2 } from 'lucide-react';

interface HotelImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export function HotelImage({ src, alt, className = '', fallbackClassName = '' }: HotelImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (hasError) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800 ${fallbackClassName}`}>
        <Building2 className="h-16 w-16 text-zinc-400" />
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className={`absolute inset-0 flex items-center justify-center bg-zinc-200 dark:bg-zinc-800`}>
          <Building2 className="h-16 w-16 animate-pulse text-zinc-400" />
        </div>
      )}
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover ${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        onLoad={() => setIsLoading(false)}
      />
    </>
  );
}