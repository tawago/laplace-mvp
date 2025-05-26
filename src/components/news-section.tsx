import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, TrendingUp, Building2, Award } from 'lucide-react';

const newsItems = [
  {
    id: 1,
    title: 'THE SAIL Reaches 42% Sales Milestone',
    excerpt: 'Strong investor interest drives rapid sales growth in our flagship Melaka property.',
    date: '2024-12-15',
    category: 'Sales Update',
    icon: TrendingUp,
    color: 'text-blue-600'
  },
  {
    id: 2,
    title: 'NYRA Hotel Receives Green Building Certification',
    excerpt: 'Our commitment to sustainability recognized with prestigious environmental award.',
    date: '2024-12-10',
    category: 'Achievement',
    icon: Award,
    color: 'text-emerald-600'
  },
  {
    id: 3,
    title: 'M-WEZ Development Progress Update',
    excerpt: 'Government announces new infrastructure investments in Melaka Waterfront Zone.',
    date: '2024-12-05',
    category: 'Infrastructure',
    icon: Building2,
    color: 'text-purple-600'
  }
];

export function NewsSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <Badge className="mb-4" variant="outline">
            Latest Updates
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
            Investment News & Updates
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Stay informed about our latest developments and market insights
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {newsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.id} className="group cursor-pointer transition-all hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 ${item.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {item.category}
                    </Badge>
                  </div>
                  
                  <h3 className="mb-2 font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {item.title}
                  </h3>
                  
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {item.excerpt}
                  </p>
                  
                  <div className="flex items-center text-xs text-zinc-500">
                    <Calendar className="mr-1 h-3 w-3" />
                    {new Date(item.date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <a href="/news" className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            View All News →
          </a>
        </div>
      </div>
    </section>
  );
}