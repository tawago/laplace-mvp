'use client';

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

import type { AmortizationDataPoint } from '../../types';

interface AmortizationChartProps {
  data: AmortizationDataPoint[];
  debtCurrency: string;
}

const chartConfig = {
  principalPaid: {
    label: 'Monthly Principal',
    color: '#3b82f6',
  },
  interestPaid: {
    label: 'Monthly Interest',
    color: '#dbeafe',
  },
  remainingBalance: {
    label: 'Remaining Balance',
    color: '#fbbf24',
  },
} satisfies ChartConfig;

export function AmortizationChart({ data, debtCurrency }: AmortizationChartProps) {
  return (
    <ChartContainer config={chartConfig} className="h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis yAxisId="payment" tickLine={false} axisLine={false} width={60} tickFormatter={(value: number) => value.toFixed(0)} />
        <YAxis
          yAxisId="balance"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(value: number) => value.toFixed(0)}
        />
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

        <Bar yAxisId="payment" dataKey="interestPaid" stackId="payment" fill="var(--color-interestPaid)" radius={[0, 0, 0, 0]} />
        <Bar yAxisId="payment" dataKey="principalPaid" stackId="payment" fill="var(--color-principalPaid)" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="balance"
          type="monotone"
          dataKey="remainingBalance"
          stroke="var(--color-remainingBalance)"
          strokeWidth={2.5}
          strokeDasharray="5 4"
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
