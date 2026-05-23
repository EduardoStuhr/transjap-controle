/**
 * Componentes de gráficos reutilizáveis para dashboard de Produção x Consumo
 * Construídos com Recharts, suportam responsividade e estado vazio
 */

import type { ReactNode, CSSProperties } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  ZAxis,
  Area,
  AreaChart,
} from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import {
  CHART_AXIS_PROPS,
  CHART_COLORS,
  CHART_GRID_PROPS,
  CHART_LEGEND_STYLE,
  CHART_SERIES_COLORS,
} from "@/lib/chart-theme";

interface BaseChartProps {
  title: string;
  description: string;
  hasData: boolean;
  height?: number;
}

interface ProductionConsumptionData {
  date: string;
  label: string;
  m3: number;
  liters: number;
  loose: number;
}

export function ProductionConsumptionCompactChart({
  data,
  title = "Produção × Consumo por dia",
  description = "m³ compactado vs litros diesel",
  height = 280,
  hasData,
}: BaseChartProps & {
  data: ProductionConsumptionData[];
}) {
  return (
    <ChartCard title={title} description={description} hasData={hasData} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
          <YAxis
            yAxisId="m3"
            {...CHART_AXIS_PROPS}
            label={{ value: "m³", angle: -90, position: "insideLeft" }}
          />
          <YAxis
            yAxisId="liters"
            orientation="right"
            {...CHART_AXIS_PROPS}
            label={{ value: "litros", angle: 90, position: "insideRight" }}
          />
          <Tooltip />
          <Legend wrapperStyle={CHART_LEGEND_STYLE as CSSProperties} />
          <Bar
            yAxisId="m3"
            dataKey="m3"
            name="m³ compactado"
            fill={CHART_COLORS.production}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="liters"
            type="monotone"
            dataKey="liters"
            name="litros diesel"
            stroke={CHART_COLORS.consumption}
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface BarChartData {
  label: string;
  value: number;
}

export function SimpleBarChart({
  data,
  title,
  description,
  hasData,
  height = 280,
  dataKey = "value",
  nameKey = "label",
  color = CHART_COLORS.production,
  layout = "vertical",
}: BaseChartProps & {
  data: Record<string, unknown>[];
  dataKey?: string;
  nameKey?: string;
  color?: string;
  layout?: "vertical" | "horizontal";
}) {
  const isVertical = layout === "vertical";
  const marginLeft = isVertical ? 120 : 0;

  return (
    <ChartCard title={title} description={description} hasData={hasData} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 16, left: marginLeft, bottom: 4 }}
        >
          <CartesianGrid {...CHART_GRID_PROPS} horizontal={!isVertical} />
          {isVertical ? (
            <>
              <XAxis type="number" {...CHART_AXIS_PROPS} />
              <YAxis dataKey={nameKey} type="category" width={110} {...CHART_AXIS_PROPS} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} />
            </>
          )}
          <Tooltip />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface DieselHoursProductionPoint {
  id: string;
  label: string;
  hours: number;
  compactedM3: number;
  liters: number;
  z: number;
  color: string;
  efficiencyPercent: number;
}

export function DieselHoursProductionScatterChart({
  data,
  title = "Diesel × Horas × Produção",
  description = "Relação entre eficiência operacional",
  hasData,
  height = 340,
}: BaseChartProps & {
  data: DieselHoursProductionPoint[];
}) {
  return (
    <ChartCard title={title} description={description} hasData={hasData} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 18, left: 0, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            type="number"
            dataKey="hours"
            name="horas"
            {...CHART_AXIS_PROPS}
            tickFormatter={(v) => `${v}h`}
          />
          <YAxis
            type="number"
            dataKey="compactedM3"
            name="m³"
            {...CHART_AXIS_PROPS}
            tickFormatter={(v) => `${v}m³`}
          />
          <ZAxis type="number" dataKey="z" range={[90, 900]} />
          <Tooltip />
          <Scatter data={data} name="Eficiência">
            {data.map((entry) => (
              <Cell key={entry.id} fill={entry.color} fillOpacity={0.82} stroke={entry.color} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface PieChartData {
  name: string;
  value: number;
}

export function DistributionPieChart({
  data,
  title,
  description,
  hasData,
  height = 280,
}: BaseChartProps & {
  data: PieChartData[];
}) {
  return (
    <ChartCard title={title} description={description} hasData={hasData} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={98}
            paddingAngle={2}
            labelLine={false}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={CHART_LEGEND_STYLE as CSSProperties} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface AreaChartData {
  date: string;
  label: string;
  [key: string]: string | number;
}

export function ProductionAreaCompactChart({
  data,
  title,
  description,
  hasData,
  height = 280,
  valueKey = "value",
  color = CHART_COLORS.production,
}: BaseChartProps & {
  data: AreaChartData[];
  valueKey?: string;
  color?: string;
}) {
  return (
    <ChartCard title={title} description={description} hasData={hasData} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey={valueKey}
            name="Produção"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.3}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/**
 * Componente de estado vazio reutilizável
 * Usado quando não há dados suficientes para renderizar um gráfico
 */
export function EmptyChartState({
  title,
  message,
  suggestion,
}: {
  title: string;
  message: string;
  suggestion?: string;
}) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-6 text-center">
      <div className="mb-3 text-4xl opacity-30">📊</div>
      <h3 className="font-black uppercase tracking-wider mb-1">{title}</h3>
      <p className="text-sm text-on-surface-variant mb-3">{message}</p>
      {suggestion && <p className="text-xs text-on-surface-variant italic">{suggestion}</p>}
    </div>
  );
}

/**
 * Grid responsivo para layout de gráficos
 * Adapta-se automaticamente para mobile, tablet e desktop
 */
export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}
