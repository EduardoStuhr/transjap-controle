import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/manutencao")({ component: Manutencao });

const TYPES = [
  { name: "Preventiva", icon: "shield", count: 12 },
  { name: "Corretiva", icon: "build_circle", count: 5 },
  { name: "Revisão", icon: "fact_check", count: 8 },
  { name: "Troca de óleo", icon: "oil_barrel", count: 3 },
  { name: "Sistema hidráulico", icon: "water_drop", count: 2 },
  { name: "Elétrica", icon: "bolt", count: 4 },
];

const HISTORY = [
  { equip: "Escavadeira CAT 320", type: "Sistema hidráulico", date: "12/05/2026", tech: "Davi", status: "Concluída" },
  { equip: "Caminhão Volvo FH-540", type: "Preventiva", date: "10/05/2026", tech: "Equipe Mecânica", status: "Em andamento" },
  { equip: "Trator Komatsu D61", type: "Troca de óleo", date: "08/05/2026", tech: "Eduardo", status: "Concluída" },
  { equip: "Pá Carregadeira CAT 950", type: "Revisão", date: "05/05/2026", tech: "Davi", status: "Concluída" },
];

function Manutencao() {
  return (
    <AppLayout title="Controle de Manutenção">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Gerencie manutenções preventivas e corretivas da frota TransJap.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {TYPES.map((t) => (
          <div key={t.name} className="bg-surface-low border border-border-low p-5 hover:border-primary-container/50 transition-colors group">
            <Icon name={t.icon} className="text-primary-container text-3xl" />
            <h3 className="text-sm font-semibold text-on-surface mt-3">{t.name}</h3>
            <p className="text-xs text-on-surface-variant">{t.count} ativas</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-container border border-border-low overflow-hidden">
        <div className="p-6 border-b border-border-low flex justify-between bg-surface-low">
          <h3 className="text-2xl font-semibold">Histórico de Manutenções</h3>
          <button className="bg-primary-container text-on-primary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90">
            <Icon name="add" className="text-base" /> Nova Manutenção
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-lowest border-b border-border-low">
              <tr>{["Equipamento","Tipo","Data","Técnico","Status"].map(h => (
                <th key={h} className="px-6 py-4 text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border-low">
              {HISTORY.map((h, i) => (
                <tr key={i} className="hover:bg-surface-high">
                  <td className="px-6 py-4 text-sm font-semibold">{h.equip}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{h.type}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{h.date}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{h.tech}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${h.status === "Concluída" ? "bg-status-success/10 text-status-success border-status-success/30" : "bg-primary-container/10 text-primary-container border-primary-container/30"}`}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
