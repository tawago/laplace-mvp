import { Hotel } from '@/types/hotel';

export const hotels: Hotel[] = [
  {
    id: 'the-sail',
    name: 'THE SAIL Hotel Tower',
    location: 'Melaka',
    country: 'Malaysia',
    description: 'An architectural icon in Melaka, offering breathtaking views of the Strait of Malacca. This luxury hotel combines modern design with exceptional hospitality.',
    roiGuaranteed: '5-8% p.a.',
    roiPercentage: 8,
    buybackYear: 19,
    buybackPercentage: 170,
    thumbnail: '/images/sail-thumb.jpg',
    images: [
      '/images/sail-1.jpg',
      '/images/sail-2.jpg',
      '/images/sail-3.jpg',
      '/images/sail-4.jpg'
    ],
    totalUnits: 150,
    availableUnits: 87,
    minInvestment: 1000,
    tokenPrice: 3.40,
    currency: 'USD',
    features: [
      'Ocean view',
      'Premium location',
      'Professional management',
      'Guaranteed returns',
      'Buyback clause'
    ],
    units: [
      {
        id: 'sail-a',
        type: 'A',
        name: 'Studio Deluxe',
        size: 38,
        sizeUnit: 'm²',
        totalPrice: 34000,
        pricePerSqm: 894.74,
        totalTokens: 10000,
        availableTokens: 7500,
        floor: '15-20',
        view: 'Sea View',
        features: ['Balcony', 'Full kitchen', 'Air conditioning']
      },
      {
        id: 'sail-b',
        type: 'B',
        name: 'Suite Executive',
        size: 56,
        sizeUnit: 'm²',
        totalPrice: 42000,
        pricePerSqm: 750,
        totalTokens: 10000,
        availableTokens: 5200,
        floor: '21-30',
        view: 'Panoramic Sea View',
        features: ['Large balcony', 'Living room', 'Gourmet kitchen', 'Bathtub']
      },
      {
        id: 'sail-c',
        type: 'C',
        name: 'Compact Suite',
        size: 27,
        sizeUnit: 'm²',
        totalPrice: 30000,
        pricePerSqm: 1111.11,
        totalTokens: 10000,
        availableTokens: 8900,
        floor: '10-14',
        view: 'City View',
        features: ['Kitchenette', 'Work area', 'Smart TV']
      }
    ]
  },
  {
    id: 'nyra',
    name: 'NYRA Oceanview Hotel',
    location: 'Melaka',
    country: 'Malaysia',
    description: 'Contemporary beachfront resort with sustainable design and exclusive experiences. NYRA redefines hospitality with technology and comfort.',
    roiGuaranteed: '8% p.a.',
    roiPercentage: 8,
    buybackYear: 9,
    buybackPercentage: 100,
    thumbnail: '/images/nyra-thumb.jpg',
    images: [
      '/images/nyra-1.jpg',
      '/images/nyra-2.jpg',
      '/images/nyra-3.jpg',
      '/images/nyra-4.jpg'
    ],
    totalUnits: 200,
    availableUnits: 142,
    minInvestment: 500,
    tokenPrice: 1.93,
    currency: 'USD',
    features: [
      'Oceanfront location',
      'Sustainable design',
      'Fixed 8% ROI',
      '9-year buyback',
      'International management'
    ],
    units: [
      {
        id: 'nyra-a',
        type: 'A',
        name: 'Ocean Studio',
        size: 44.5,
        sizeUnit: 'm²',
        totalPrice: 19300,
        pricePerSqm: 433.71,
        totalTokens: 10000,
        availableTokens: 6800,
        floor: '5-15',
        view: 'Lateral Ocean View',
        features: ['Balcony', 'Mini kitchen', 'Work area', 'Safe']
      },
      {
        id: 'nyra-b',
        type: 'B',
        name: 'Premium Suite',
        size: 53.1,
        sizeUnit: 'm²',
        totalPrice: 23400,
        pricePerSqm: 440.68,
        totalTokens: 10000,
        availableTokens: 4300,
        floor: '16-25',
        view: 'Frontal Ocean View',
        features: ['Panoramic balcony', 'Separate living room', 'Full kitchen', 'Jacuzzi']
      },
      {
        id: 'nyra-e',
        type: 'E',
        name: 'Penthouse',
        size: 70.3,
        sizeUnit: 'm²',
        totalPrice: 30200,
        pricePerSqm: 429.44,
        totalTokens: 10000,
        availableTokens: 9200,
        floor: '26-30',
        view: '360° View',
        features: ['Private terrace', '2 bedrooms', 'Gourmet kitchen', 'Home theater', 'Private pool']
      }
    ]
  }
];