'use client';

import { Pie, PieChart } from 'recharts';

import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface PaymentBreakdownChartProps {
  principal: number;
  totalInterest: number;
  debtCurrency: string;
}

const chartConfig = {
  principal: {
    label: 'Principal',
    color: '#3b82f6',
  },
  interest: {
    label: 'Interest',
    color: '#dbeafe',
  },
} satisfies ChartConfig;

export function PaymentBreakdownChart({ principal, totalInterest, debtCurrency }: PaymentBreakdownChartProps) {
  const chartData = [
    { name: 'principal', value: Math.max(principal, 0), fill: 'var(--color-principal)' },
    { name: 'interest', value: Math.max(totalInterest, 0), fill: 'var(--color-interest)' },
  ];

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                const numericValue = Number(value);
                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span>{name}</span>
                    <span className="font-mono tabular-nums">
                      {Number.isFinite(numericValue) ? numericValue.toFixed(4) : '0.0000'} {debtCurrency}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0} />
      </PieChart>
    </ChartContainer>
  );
}
