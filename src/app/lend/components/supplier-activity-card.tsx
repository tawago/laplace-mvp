import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type { SupplierEvent } from '../types';

interface SupplierActivityCardProps {
  isLoading: boolean;
  events: SupplierEvent[];
}

export function SupplierActivityCard({ isLoading, events }: SupplierActivityCardProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Supplier Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`supplier-event-skeleton-${index}`}
                tone="light"
                className="h-[66px] rounded-lg border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">No supplier activity yet for this market.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        event.status === 'COMPLETED' ? 'default' : event.status === 'FAILED' ? 'destructive' : 'secondary'
                      }
                      className={
                        event.status === 'COMPLETED'
                          ? 'bg-emerald-600 text-white'
                          : event.status === 'FAILED'
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-200 text-slate-700'
                      }
                    >
                      {event.status}
                    </Badge>
                    <span className="truncate text-sm text-slate-900">
                      {event.eventType.replace('LENDING_', '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.amount ? `${event.amount} ${event.currency ?? ''}` : 'No amount'}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
