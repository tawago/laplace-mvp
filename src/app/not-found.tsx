import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-zinc-200 dark:text-zinc-800">404</h1>
        </div>
        <h2 className="mb-4 text-2xl font-bold">Page Not Found</h2>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}