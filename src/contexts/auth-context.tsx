'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  email: string;
  name: string;
  picture: string;
  wallet: {
    address: string;
    balance: number;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (provider: 'google' | 'twitter' | 'github') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('hoteltoken-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const generateWalletAddress = () => {
    // Mock wallet address generation (Account Abstraction style)
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  };

  const login = async (provider: 'google' | 'twitter' | 'github') => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock user data based on provider
    const mockUsers = {
      google: {
        email: 'investor@gmail.com',
        name: 'John Investor',
        picture: 'https://ui-avatars.com/api/?name=John+Investor&background=4285f4&color=fff',
      },
      twitter: {
        email: 'crypto@twitter.com',
        name: 'Crypto Investor',
        picture: 'https://ui-avatars.com/api/?name=Crypto+Investor&background=1da1f2&color=fff',
      },
      github: {
        email: 'dev@github.com',
        name: 'Dev Investor',
        picture: 'https://ui-avatars.com/api/?name=Dev+Investor&background=24292e&color=fff',
      },
    };

    const userData = mockUsers[provider];
    const newUser: User = {
      ...userData,
      wallet: {
        address: generateWalletAddress(),
        balance: 10000, // Mock balance in USD
      },
    };

    setUser(newUser);
    localStorage.setItem('hoteltoken-user', JSON.stringify(newUser));
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('hoteltoken-user');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}