import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type { BorrowerEvent } from '../types';

interface BorrowerActivityCardProps {
  isLoading: boolean;
  events: BorrowerEvent[];
}

export function BorrowerActivityCard({ isLoading, events }: BorrowerActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Borrower Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`event-skeleton-${index}`}
                className="h-[66px] rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No borrower activity yet for this market.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 8).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        event.status === 'COMPLETED'
                          ? 'default'
                          : event.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className={
                        event.status === 'COMPLETED'
                          ? 'bg-emerald-600 text-white'
                          : event.status === 'FAILED'
                            ? 'bg-rose-500 text-white'
                            : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100'
                      }
                    >
                      {event.status}
                    </Badge>
                    <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                      {event.eventType.replace('LENDING_', '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {event.amount ? `${event.amount} ${event.currency ?? ''}` : 'No amount'}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
