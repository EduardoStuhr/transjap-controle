import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/manutencao")({ component: Manutencao });

interface MaintenanceType {
  name: string;
  icon: string;
  count: number;
  description: string;
  color: string;
}

interface MaintenanceRecord {
  equip: string;
  type: string;
  date: string;
  tech: string;
  status: "Concluída" | "Em andamento" | "Atrasada";
  deadline: string;
}

const TYPES: MaintenanceType[] = [
  { name: "Preventiva", icon: "shield", count: 12, description: "Manutenções programadas", color: "bg-status-success/10 text-status-success" },
  { name: "Corretiva", icon: "build_circle", count: 5, description: "Reparos emergenciais", color: "bg-status-error/10 text-status-error" },
  { name: "Inspeção", icon: "fact_check", count: 8, description: "Checklists técnicos", color: "bg-status-info/10 text-status-info" },
  { name: "Troca de óleo", icon: "oil_barrel", count: 3, description: "Lubrificantes e filtros", color: "bg-primary/10 text-primary" },
  { name: "Hidráulica", icon: "water_drop", count: 2, description: "Bombas e cilindros", color: "bg-status-warning/10 text-status-warning" },
  { name: "Mecânica", icon: "settings", count: 4, description: "Motor e transmissão", color: "bg-surface-high text-on-surface" },
];

const HISTORY: MaintenanceRecord[] = [
  { equip: "Escavadeira CAT 320", type: "Sistema hidráulico", date: "12/05/2026", tech: "Davi", status: "Concluída", deadline: "12/05/2026" },
  { equip: "Caminhão Volvo FH-540", type: "Preventiva", date: "20/05/2026", tech: "Equipe Mecânica", status: "Em andamento", deadline: "20/05/2026" },
  { equip: "Trator Komatsu D61", type: "Troca de óleo", date: "08/05/2026", tech: "Eduardo", status: "Concluída", deadline: "08/05/2026" },
  { equip: "Pá Carregadeira CAT 950", type: "Revisão", date: "05/05/2026", tech: "Davi", status: "Concluída", deadline: "05/05/2026" },
  { equip: "Empilhadeira Hyster H80", type: "Inspeção elétrica", date: "15/05/2026", tech: "Workshop Team", status: "Em andamento", deadline: "18/05/2026" },
];

function Manutencao() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const filteredRecords = selectedType
    ? HISTORY.filter((h) => h.type.toLowerCase().includes(selectedType.toLowerCase()))
    : HISTORY;

  const totalMaintenance = TYPES.reduce((sum, t) => sum + t.count, 0);
  const completedCount = HISTORY.filter((h) => h.status === "Concluída").length;
  const activeCount = HISTORY.filter((h) => h.status === "Em andamento").length;
  const overdueCount = HISTORY.filter((h) => h.status === "Atrasada").length;

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">Centro de Manutenção</h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">Gestão de preventivas, corretivas e inspeções técnicas</p>
        </div>
        <Button onClick={() => toast("Nova Manutenção", { description: "Abrindo formulário técnico..." })} className="font-black gap-2 shadow-industrial">
          <Icon name="add" />
          Registrar Manutenção
        </Button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-container border border-border-low rounded-lg p-4">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">Total</p>
          <p className="text-3xl font-black text-primary">{totalMaintenance}</p>
          <p className="text-xs text-on-surface-variant mt-1">Ativas</p>
        </div>
        <div className="bg-status-success/10 border border-status-success/30 rounded-lg p-4">
          <p className="text-[10px] font-black text-status-success uppercase tracking-widest mb-2">Concluídas</p>
          <p className="text-3xl font-black text-status-success">{completedCount}</p>
        </div>
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
          <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Em Andamento</p>
          <p className="text-3xl font-black text-primary">{activeCount}</p>
        </div>
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-4">
          <p className="text-[10px] font-black text-status-error uppercase tracking-widest mb-2">Atrasadas</p>
          <p className="text-3xl font-black text-status-error">{overdueCount}</p>
        </div>
      </div>

      {/* Maintenance Types */}
      <div className="mb-8">
        <h2 className="text-lg font-black text-on-surface uppercase mb-4 flex items-center gap-2">
          <Icon name="category" className="text-primary" />
          Tipos de Manutenção
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TYPES.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelectedType(selectedType === t.name ? null : t.name)}
              className={`p-4 rounded-lg border transition-all ${
                selectedType === t.name
                  ? `${t.color} border-current shadow-md scale-105`
                  : "bg-surface-container border-border-low hover:border-primary/50"
              }`}
            >
              <Icon name={t.icon} className="text-3xl mb-2 block" />
              <h3 className="text-xs font-black uppercase leading-tight">{t.name}</h3>
              <p className="text-2xl font-black mt-1">{t.count}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Records Table/List */}
      <div className="bg-surface-container border border-border-low shadow-industrial rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border-low bg-surface-low flex justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-on-surface uppercase">Registro de Intervenções</h2>
            <p className="text-xs text-on-surface-variant font-medium mt-1 uppercase tracking-widest">
              {selectedType ? `Filtrando por: ${selectedType}` : "Histórico completo de reparos"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-high"}`}
            >
              <Icon name="view_list" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-high"}`}
            >
              <Icon name="grid_3x3" />
            </button>
            {selectedType && (
              <button
                onClick={() => setSelectedType(null)}
                className="px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-high rounded transition-colors"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </div>

        {viewMode === "list" ? (
          // List View
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-lowest border-b border-border-low">
                <tr>
                  {["Equipamento", "Tipo", "Prazo Técnico", "Técnico", "Status"].map((h) => (
                    <th key={h} className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-black">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-low">
                {filteredRecords.map((h, i) => {
                  const urgency = getUrgencyLevel(h.deadline);
                  return (
                    <tr key={i} className="hover:bg-surface-high transition-colors group cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface-highest flex items-center justify-center rounded border border-border-low group-hover:border-primary transition-colors">
                            <Icon name="construction" className="text-primary text-base" />
                          </div>
                          <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{h.equip}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-on-surface">{h.type}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-on-surface">{h.deadline}</span>
                          <span className={`text-[10px] font-black uppercase tracking-wider ${urgency.colorClass}`}>
                            {urgency.timeRemaining}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-on-surface-variant">{h.tech}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                            h.status === "Concluída"
                              ? "bg-status-success/10 text-status-success border-status-success/30"
                              : h.status === "Em andamento"
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-status-error/10 text-status-error border-status-error/30"
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {filteredRecords.map((h, i) => {
              const urgency = getUrgencyLevel(h.deadline);
              return (
                <button
                  key={i}
                  onClick={() => toast(h.type, { description: `${h.status} em ${h.date}` })}
                  className="border border-border-low rounded-lg p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group bg-surface-highest/50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Icon name="build" className="text-primary text-2xl" />
                    <span
                      className={`px-2 py-1 text-[10px] font-black uppercase rounded ${
                        h.status === "Concluída"
                          ? "bg-status-success/10 text-status-success"
                          : h.status === "Em andamento"
                            ? "bg-primary/10 text-primary"
                            : "bg-status-error/10 text-status-error"
                      }`}
                    >
                      {h.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-1">
                    {h.equip}
                  </h3>
                  <p className="text-xs text-on-surface-variant mb-3">{h.type}</p>
                  <dl className="space-y-2 text-xs text-on-surface-variant mb-3 pb-3 border-b border-border-low">
                    <div className="flex justify-between">
                      <dt>Técnico:</dt>
                      <dd className="font-bold text-on-surface">{h.tech}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Realizado:</dt>
                      <dd className="font-bold text-on-surface">{h.date}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Prazo:</dt>
                      <dd className={`font-bold ${urgency.colorClass}`}>{urgency.timeRemaining}</dd>
                    </div>
                  </dl>
                  <div className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1">
                    <Icon name="arrow_forward" />
                    Ver detalhes
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {filteredRecords.length === 0 && (
          <div className="text-center py-12">
            <Icon name="build" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface-variant">Nenhuma manutenção neste filtro</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
