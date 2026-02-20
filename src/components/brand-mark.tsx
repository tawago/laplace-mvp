import { cn } from '@/lib/utils';
import { Building2 } from 'lucide-react';

interface BrandMarkProps {
  className?: string;
  textClassName?: string;
}

export function BrandMark({ className, textClassName }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Building2 aria-hidden="true" className="h-7 w-7" strokeWidth={1} />
      <span className={cn('font-extralight font-lg uppercase tracking-[0.45em]', textClassName)}>LAPLACE</span>
    </div>
  );
}
