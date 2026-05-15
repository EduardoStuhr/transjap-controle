import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/equipamentos")({ component: Equipamentos });

const FLEET = [
  { id: "FR-001", model: "Escavadeira CAT 320", icon: "snowmobile", hours: 8420, status: "Operação", tone: "success", location: "Obra Norte", last: "12/05/2026" },
  { id: "FR-002", model: "Caminhão Volvo FH-540", icon: "local_shipping", hours: 12345, status: "Manutenção", tone: "warning", location: "Oficina", last: "10/05/2026" },
  { id: "FR-003", model: "Trator Komatsu D61", icon: "agriculture", hours: 5210, status: "Operação", tone: "success", location: "Obra Sul", last: "08/05/2026" },
  { id: "FR-004", model: "Pá Carregadeira CAT 950", icon: "construction", hours: 9876, status: "Parado", tone: "error", location: "Pátio", last: "05/05/2026" },
  { id: "FR-005", model: "Empilhadeira Hyster H80", icon: "forklift", hours: 3210, status: "Operação", tone: "success", location: "Almoxarifado", last: "04/05/2026" },
];

const toneBg: Record<string, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  error: "bg-status-error/10 text-status-error border-status-error/30",
};

function Equipamentos() {
  return (
    <AppLayout title="Equipamentos da Frota">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Cadastro completo da frota TransJap com horímetro, status e localização.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FLEET.map((e) => (
          <button
            type="button"
            key={e.id}
            onClick={() => toast(e.model, { description: `Frota ${e.id} · ${e.status} · ${e.location}` })}
            className="text-left bg-surface-container border border-border-low p-6 hover:border-primary-container/40 transition-colors"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-14 h-14 bg-surface-variant rounded flex items-center justify-center">
                <Icon name={e.icon} className="text-primary-container text-3xl" />
              </div>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${toneBg[e.tone]}`}>{e.status}</span>
            </div>
            <p className="text-xs uppercase tracking-wider text-on-surface-variant">Frota {e.id}</p>
            <h3 className="text-lg font-bold text-on-surface mt-1">{e.model}</h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant">Horímetro</dt>
                <dd className="text-on-surface font-semibold mt-0.5">{e.hours.toLocaleString("pt-BR")} h</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant">Localização</dt>
                <dd className="text-on-surface font-semibold mt-0.5">{e.location}</dd>
              </div>
              <div className="col-span-2">
                <dt className="uppercase tracking-wider text-on-surface-variant">Última manutenção</dt>
                <dd className="text-on-surface font-semibold mt-0.5">{e.last}</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
    </AppLayout>
  );
}
