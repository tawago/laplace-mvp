import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  Globe, 
  Users, 
  Shield, 
  Award,
  FileText,
  Download
} from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Hero Section */}
      <section className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="text-center">
            <Badge className="mb-4" variant="secondary">
              Established 2012
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Sheng Tai International
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">
              A leading real estate tokenization platform revolutionizing property investment 
              through blockchain technology and guaranteed returns.
            </p>
          </div>
        </div>
      </section>

      {/* Company Overview */}
      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 text-2xl font-bold">Pioneering Tokenized Real Estate</h2>
              <p className="mb-4 text-zinc-600 dark:text-zinc-400">
                Founded by Dato' Leong Sir Ley, Sheng Tai International has grown from a 
                boutique real estate firm to a global leader in property tokenization. 
                We specialize in transforming premium hotel assets into accessible investment 
                opportunities through blockchain technology.
              </p>
              <p className="mb-4 text-zinc-600 dark:text-zinc-400">
                Our flagship projects, THE SAIL and NYRA in Malaysia's Melaka Waterfront 
                Economic Zone, represent the future of real estate investment - combining 
                guaranteed returns, buyback protection, and the security of blockchain technology.
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                With zero bank debt and a track record of successful asset restructuring, 
                we offer investors a unique combination of stability, transparency, and growth potential.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                    <Globe className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="mb-2 font-semibold">Global Presence</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Offices in Hong Kong, Shanghai, Tokyo, Osaka, and UK
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                    <Users className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="mb-2 font-semibold">400+ Monthly</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Investors visiting our properties through our tourism program
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                    <Shield className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="mb-2 font-semibold">Zero Debt</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Fully self-funded operations with no bank debt
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                    <Award className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="mb-2 font-semibold">Award Winning</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Multiple industry awards for innovation and excellence
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* M-WEZ Section */}
      <section className="border-t bg-white px-4 py-12 dark:bg-zinc-950 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <Badge className="mb-4" variant="outline">
              Government Backed Initiative
            </Badge>
            <h2 className="mb-6 text-2xl font-bold">Melaka Waterfront Economic Zone (M-WEZ)</h2>
            <p className="mx-auto max-w-3xl text-zinc-600 dark:text-zinc-400">
              Our properties are part of Malaysia's mega-development program targeting 
              RM 100 billion in investments and creating 20,000 jobs annually. This government-backed 
              initiative ensures long-term value appreciation and sustainable returns for our investors.
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">RM 100B</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Target Investment</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">20,000</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Annual Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">2 Hotels</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Premium Properties</p>
            </div>
          </div>
        </div>
      </section>

      {/* Resources Section */}
      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-center text-2xl font-bold">Investment Resources</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="group cursor-pointer transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">THE SAIL Hotel Prospectus</h3>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Detailed investment information for THE SAIL Hotel Tower including 
                      financial projections, unit types, and guaranteed returns structure.
                    </p>
                  </div>
                  <Download className="h-5 w-5 text-zinc-400 transition-colors group-hover:text-zinc-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      <h3 className="font-semibold">NYRA Hotel Prospectus</h3>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Complete investment guide for NYRA Oceanview Hotel featuring 
                      8% guaranteed returns and 9-year buyback option details.
                    </p>
                  </div>
                  <Download className="h-5 w-5 text-zinc-400 transition-colors group-hover:text-zinc-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold">Ready to Invest?</h2>
          <p className="mb-8 text-zinc-600 dark:text-zinc-400">
            Join thousands of investors earning guaranteed returns through tokenized real estate
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <a href="/discover">View Properties</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="mailto:invest@shengtai.com">Contact Us</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}