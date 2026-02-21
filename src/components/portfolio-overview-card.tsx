'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PortfolioOverviewCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  iconTone: 'blue' | 'green' | 'purple' | 'orange';
  isLoading: boolean;
  meta?: ReactNode;
}

const ICON_TONE_CLASSNAMES: Record<
  PortfolioOverviewCardProps['iconTone'],
  { container: string; icon: string }
> = {
  blue: {
    container: 'rounded-lg bg-blue-100 p-3 dark:bg-blue-900/20',
    icon: 'h-6 w-6 text-blue-600',
  },
  green: {
    container: 'rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900/20',
    icon: 'h-6 w-6 text-emerald-600',
  },
  purple: {
    container: 'rounded-lg bg-purple-100 p-3 dark:bg-purple-900/20',
    icon: 'h-6 w-6 text-purple-600',
  },
  orange: {
    container: 'rounded-lg bg-orange-100 p-3 dark:bg-orange-900/20',
    icon: 'h-6 w-6 text-orange-600',
  },
};

export function PortfolioOverviewCard({
  label,
  value,
  icon: Icon,
  iconTone,
  isLoading,
  meta,
}: PortfolioOverviewCardProps) {
  const tone = ICON_TONE_CLASSNAMES[iconTone];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
            {isLoading ? (
              <>
                <Skeleton className="mt-2 h-8 w-28" />
                {meta ? <Skeleton className="mt-2 h-4 w-20" /> : null}
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold">{value}</p>
                {meta}
              </>
            )}
          </div>
          <div className={tone.container}>
            <Icon className={tone.icon} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
