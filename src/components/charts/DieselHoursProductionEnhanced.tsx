/**
 * Gráfico aprimorado: Diesel × Horas × Produção
 * Mostra eficiência operacional com referência de média e cores de status
 */

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_LEGEND_STYLE } from "@/lib/chart-theme";
import type { CSSProperties } from "react";

export interface EfficiencyBubblePoint {
  id: string;
  name: string; // Aggregate or equipment name
  hours: number; // X axis
  compactedM3: number; // Y axis
  liters: number; // Bubble size
  color: string; // Status color
  efficiencyPercent: number;
  fuelPerHour: number;
  productionPerHour: number;
  fuelPerM3: number;
  costPerM3: number;
  type: "aggregate" | "equipment"; // To distinguish in tooltip
}

interface DieselHoursProductionEnhancedProps {
  data: EfficiencyBubblePoint[];
  item?: string;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "full";
  hasData?: boolean;
}

function RichBubbleTooltip({
  active,
  payload,
  hideProduction = false,
}: {
  active?: boolean;
  payload?: Array<{ payload: EfficiencyBubblePoint }>;
  hideProduction?: boolean;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;

  if (hideProduction) {
    return (
      <div
        style={{
          background: "rgba(15,15,15,0.96)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
        }}
      >
        <div className="mb-2 font-bold">{point.name}</div>
        <div className="space-y-1 text-on-surface-variant">
          <div className="flex justify-between gap-4">
            <span>Horas:</span>
            <span style={{ fontFamily: "monospace" }}>{point.hours.toFixed(1)} h</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Litros diesel:</span>
            <span style={{ fontFamily: "monospace" }}>{point.liters.toFixed(0)} L</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Diesel/hora:</span>
            <span style={{ fontFamily: "monospace" }}>{point.fuelPerHour.toFixed(2)} L/h</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(15,15,15,0.96)",
        border: "0.5px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div className="mb-2 font-bold">{point.name}</div>
      <div className="space-y-1 text-on-surface-variant">
        <div className="flex justify-between gap-4">
          <span>Horas:</span>
          <span style={{ fontFamily: "monospace" }}>{point.hours.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>m³ produzido:</span>
          <span style={{ fontFamily: "monospace" }}>{point.compactedM3.toFixed(1)} m³</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Litros diesel:</span>
          <span style={{ fontFamily: "monospace" }}>{point.liters.toFixed(0)} L</span>
        </div>
        <div className="border-t border-border-low/30 my-1 pt-1" />
        <div className="flex justify-between gap-4">
          <span>Produção/hora:</span>
          <span style={{ fontFamily: "monospace" }}>{point.productionPerHour.toFixed(2)} m³/h</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Diesel/hora:</span>
          <span style={{ fontFamily: "monospace" }}>{point.fuelPerHour.toFixed(2)} L/h</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Diesel/m³:</span>
          <span style={{ fontFamily: "monospace" }}>{point.fuelPerM3.toFixed(2)} L/m³</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Eficiência:</span>
          <span style={{ fontFamily: "monospace", color: point.color }}>
            {point.efficiencyPercent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function DieselHoursProductionEnhanced({
  data,
  item,
  title = "Eficiência Operacional",
  description = "Diesel × Horas × Produção",
  size = "lg",
  hasData = true,
}: DieselHoursProductionEnhancedProps) {
  const hideProduction = item === "escavacao";
  const stats = useMemo(() => {
    if (data.length === 0) {
      return { avgHours: 0, avgY: 0 };
    }
    const avgHours = data.reduce((sum, p) => sum + p.hours, 0) / data.length;
    const avgY =
      data.reduce((sum, p) => sum + (hideProduction ? p.fuelPerHour : p.compactedM3), 0) /
      data.length;
    return { avgHours, avgY };
  }, [data, hideProduction]);

  // Calculate bubble size limits to prevent overlaps
  const bubbleSizeRange = useMemo(() => {
    if (data.length === 0) return { min: 100, max: 400 };
    const litersMin = Math.min(...data.map((p) => p.liters));
    const litersMax = Math.max(...data.map((p) => p.liters));
    // Map min/max liters to bubble sizes [50, 300]
    return {
      min: Math.max(50, (litersMin / litersMax) * 100 + 50),
      max: 300,
    };
  }, [data]);

  if (!hasData || data.length === 0) {
    return (
      <ChartCard
        title={title}
        description={description}
        hasData={false}
        size={size}
        emptyMessage="Sem dados de eficiência para exibir. Certifique-se de que as análises possuem registros de horas, produção e diesel."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ChartCard title={title} description={description} size={size} hasData={true}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 18, left: 0, bottom: 24 }}>
            <CartesianGrid {...CHART_GRID_PROPS} />

            {/* Reference lines for averages */}
            <ReferenceLine
              x={stats.avgHours}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="5 5"
              label={{
                value: `Média: ${stats.avgHours.toFixed(1)}h`,
                position: "top",
                fill: "rgba(255,255,255,0.5)",
                fontSize: 10,
              }}
            />
            {!hideProduction && (
              <ReferenceLine
              y={stats.avgY}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="5 5"
              label={{
                value: `Med: ${stats.avgY.toFixed(0)}m3`,
                position: "insideLeft",
                fill: "rgba(255,255,255,0.5)",
                fontSize: 10,
              }}
              />
            )}

            <XAxis
              type="number"
              dataKey="hours"
              name="Horas"
              {...CHART_AXIS_PROPS}
              label={{
                value: "Horas Trabalhadas →",
                position: "bottom",
                offset: 10,
                fill: "rgba(255,255,255,0.7)",
              }}
            />
            {hideProduction && (
              <YAxis
                type="number"
                dataKey="fuelPerHour"
                name="L/h"
                {...CHART_AXIS_PROPS}
                label={{
                  value: "L/h",
                  angle: -90,
                  position: "insideLeft",
                  fill: "rgba(255,255,255,0.7)",
                }}
              />
            )}
            <YAxis
              type="number"
              dataKey={hideProduction ? "fuelPerHour" : "compactedM3"}
              hide={hideProduction}
              name="m³ Produzido"
              {...CHART_AXIS_PROPS}
              label={{
                value: "m³ Produzido ↑",
                angle: -90,
                position: "insideLeft",
                fill: "rgba(255,255,255,0.7)",
              }}
            />

            {/* Bubble size represents liters */}
            <ZAxis
              type="number"
              dataKey="liters"
              range={[bubbleSizeRange.min, bubbleSizeRange.max]}
              name="Diesel (L)"
            />

            <Tooltip
              content={<RichBubbleTooltip hideProduction={hideProduction} />}
              cursor={{ strokeDasharray: "3 3" }}
            />

            <Legend
              wrapperStyle={CHART_LEGEND_STYLE as CSSProperties}
              verticalAlign="bottom"
              height={40}
            />

            <Scatter data={data} name="Eficiência Operacional">
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={entry.color}
                  fillOpacity={0.7}
                  stroke={entry.color}
                  strokeWidth={2}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Legend explaining the chart */}
      <div className="rounded-lg border border-border-low bg-surface-container p-4 text-sm">
        <h4 className="mb-2 font-black uppercase tracking-widest text-on-surface">
          Guia de Leitura
        </h4>
        <div className="space-y-2 text-xs text-on-surface-variant">
          <p>
            <strong>Posição (Canto Superior Esquerdo é melhor):</strong> Quanto mais para cima e
            para esquerda, mais eficiente.
          </p>
          <p>
            <strong>Eixo X (Horas):</strong> Horas trabalhadas do agregado ou equipamento.
          </p>
          <p>
            <strong>Eixo Y (m³):</strong> Volume de m³ compactado produzido.
          </p>
          <p>
            <strong>Tamanho da Bolha (Diesel):</strong> Litros de diesel consumido. Bolhas maiores
            = mais consumo.
          </p>

          <div className="border-t border-border-low/30 my-2 pt-2" />

          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
              <span>Eficiente (≥70%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
              <span>Atenção (45-70%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
              <span>Crítico (&lt;45%)</span>
            </div>
          </div>

          <p>
            <strong>Linhas Cinzas:</strong> Representam a média de horas (vertical) e m³ (horizontal)
            para referência.
          </p>
        </div>
      </div>

      {/* Detailed view for small datasets */}
      {data.length <= 3 && !hideProduction && (
        <div className="space-y-2 rounded-lg border border-border-low bg-surface-container p-4">
          <h4 className="mb-3 font-black uppercase tracking-widest text-on-surface">
            Detalhes de cada ponto
          </h4>
          <div className="space-y-3">
            {data.map((point) => (
              <div key={point.id} className="rounded border border-border-low/50 bg-surface-lowest p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: point.color }}
                    />
                    <strong>{point.name}</strong>
                  </div>
                  <span className="text-xs font-bold" style={{ color: point.color }}>
                    {point.efficiencyPercent.toFixed(0)}% eficiente
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant">
                  <div>
                    <span className="text-on-surface">Horas:</span> {point.hours.toFixed(1)} h
                  </div>
                  <div>
                    <span className="text-on-surface">m³:</span> {point.compactedM3.toFixed(1)}
                  </div>
                  <div>
                    <span className="text-on-surface">Diesel:</span> {point.liters.toFixed(0)} L
                  </div>
                  <div>
                    <span className="text-on-surface">L/h:</span> {point.fuelPerHour.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-on-surface">m³/h:</span> {point.productionPerHour.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-on-surface">L/m³:</span> {point.fuelPerM3.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
