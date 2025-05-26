import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center space-x-2">
              <Image 
                src="/images/logo.png" 
                alt="Sheng Tai International" 
                width={32} 
                height={32}
                className="h-8 w-8 object-contain"
              />
              <span className="text-xl font-bold">Sheng Tai International</span>
            </Link>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Tokenized real estate investment platform powered by blockchain technology.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/discover" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  Properties
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  Portfolio
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-4 text-sm font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  Investment Disclaimer
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold">Contact</h3>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>invest@shengtai.com</li>
              <li>+60 3 1234 5678</li>
              <li>Kuala Lumpur, Malaysia</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-8">
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            © 2024 Sheng Tai International. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}