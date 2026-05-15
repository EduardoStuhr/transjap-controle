import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { getUrgencyLevel } from "@/lib/urgency";

export const Route = createFileRoute("/manutencao")({ component: Manutencao });

const TYPES = [
  { name: "Preventiva", icon: "shield", count: 12, description: "Manutenções programadas" },
  { name: "Corretiva", icon: "build_circle", count: 5, description: "Reparos emergenciais" },
  { name: "Inspeção", icon: "fact_check", count: 8, description: "Checklists técnicos" },
  { name: "Troca de óleo", icon: "oil_barrel", count: 3, description: "Lubrificantes e filtros" },
  { name: "Hidráulica", icon: "water_drop", count: 2, description: "Bombas e cilindros" },
  { name: "Mecânica", icon: "settings", count: 4, description: "Motor e transmissão" },
];

const HISTORY = [
  { equip: "Escavadeira CAT 320", type: "Sistema hidráulico", date: "12/05/2026", tech: "Davi", status: "Concluída", deadline: "12/05/2026" },
  { equip: "Caminhão Volvo FH-540", type: "Preventiva", date: "20/05/2026", tech: "Equipe Mecânica", status: "Em andamento", deadline: "20/05/2026" },
  { equip: "Trator Komatsu D61", type: "Troca de óleo", date: "08/05/2026", tech: "Eduardo", status: "Concluída", deadline: "08/05/2026" },
  { equip: "Pá Carregadeira CAT 950", type: "Revisão", date: "05/05/2026", tech: "Davi", status: "Concluída", deadline: "05/05/2026" },
];

function Manutencao() {
  return (
    <AppLayout title="Centro de Manutenção Técnica">
      <div className="bg-surface-low border-l-4 border-primary p-4 mb-8 shadow-industrial">
        <p className="text-on-surface-variant text-base">
          Módulo especializado para gestão técnica da frota. Aqui são gerenciados reparos mecânicos,
          preventivas e inspeções rigorosas.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
        {TYPES.map((t) => (
          <button
            type="button"
            key={t.name}
            onClick={() => toast(t.name, { description: `${t.count} manutenções ativas deste tipo.` })}
            className="text-left bg-surface-container border border-border-low p-5 hover:border-primary/50 transition-industrial group shadow-industrial relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
               <Icon name={t.icon} className="text-6xl" />
            </div>
            <Icon name={t.icon} className="text-primary text-4xl mb-3" />
            <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">{t.name}</h3>
            <p className="text-[11px] text-on-surface-variant font-medium mt-1 leading-tight">{t.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-2xl font-black text-on-surface tracking-tighter">{t.count}</span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Ativas</span>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-surface-container border border-border-low shadow-industrial-lg rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low flex-wrap gap-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Registro de Intervenções Técnicas</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-1 uppercase tracking-widest">Histórico completo de reparos e manutenções</p>
          </div>
          <Button
            onClick={() => toast("Nova Manutenção", { description: "Abrindo formulário técnico." })}
            className="font-black px-6 shadow-industrial"
          >
            <Icon name="add" /> Nova Manutenção
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-lowest border-b border-border-low">
              <tr>{["Equipamento","Tipo","Prazo Técnico","Técnico","Status"].map(h => (
                <th key={h} className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-black">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border-low">
              {HISTORY.map((h, i) => {
                const urgency = getUrgencyLevel(h.deadline);
                return (
                  <tr key={i} className="hover:bg-surface-high transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-surface-highest flex items-center justify-center rounded border border-border-low">
                            <Icon name="construction" className="text-primary text-sm" />
                         </div>
                         <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{h.equip}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{h.type}</td>
                    <td className="px-6 py-4">
                       <div className="flex flex-col">
                          <span className="text-sm font-bold text-on-surface">{h.deadline}</span>
                          <span className={`text-[10px] font-black uppercase tracking-wider ${urgency.colorClass}`}>{urgency.timeRemaining}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-on-surface-variant">{h.tech}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${h.status === "Concluída" ? "bg-status-success/10 text-status-success border-status-success/30" : "bg-primary/10 text-primary border-primary/30"}`}>{h.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
