export interface Hotel {
  id: string;
  name: string;
  location: string;
  country: string;
  description: string;
  roiGuaranteed: string;
  roiPercentage: number;
  buybackYear: number;
  buybackPercentage: number;
  thumbnail: string;
  images: string[];
  totalUnits: number;
  availableUnits: number;
  minInvestment: number;
  tokenPrice: number;
  currency: string;
  features: string[];
  units: HotelUnit[];
}

export interface HotelUnit {
  id: string;
  type: string;
  name: string;
  size: number;
  sizeUnit: string;
  totalPrice: number;
  pricePerSqm: number;
  totalTokens: number;
  availableTokens: number;
  floor: string;
  view: string;
  features: string[];
}

export interface TokenPurchase {
  id: string;
  hotelId: string;
  hotelName: string;
  unitId: string;
  unitType: string;
  tokenAmount: number;
  pricePerToken: number;
  totalPrice: number;
  purchaseDate: Date;
  estimatedROI: number;
  status: 'pending' | 'confirmed' | 'processing';
}

export interface Portfolio {
  totalInvested: number;
  estimatedAnnualReturn: number;
  totalTokens: number;
  purchases: TokenPurchase[];
}