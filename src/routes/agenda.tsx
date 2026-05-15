import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/agenda")({ component: Agenda });

const STATUSES = [
  { color: "bg-status-error", label: "Atrasado" },
  { color: "bg-status-warning", label: "Próximo do prazo" },
  { color: "bg-primary-container", label: "Em andamento" },
  { color: "bg-status-success", label: "Finalizado" },
];

const TASKS = [
  { title: "Troca de óleo Escavadeira CAT 320", equip: "CAT 320", resp: "Davi", sector: "Oficina", priority: "Alta", deadline: "15/05/2026", status: "Atrasado", tone: "error" },
  { title: "Inspeção semanal pá carregadeira", equip: "CAT 950", resp: "Eduardo", sector: "Operacional", priority: "Média", deadline: "16/05/2026", status: "Próximo do prazo", tone: "warning" },
  { title: "Manutenção preventiva caminhão Volvo", equip: "Volvo FH-540", resp: "Equipe Mecânica", sector: "Frota", priority: "Urgente", deadline: "17/05/2026", status: "Em andamento", tone: "primary" },
  { title: "Conferência de estoque almoxarifado", equip: "—", resp: "Davi", sector: "Almoxarifado", priority: "Baixa", deadline: "10/05/2026", status: "Finalizado", tone: "success" },
];

const toneBorder: Record<string, string> = {
  error: "border-status-error",
  warning: "border-status-warning",
  primary: "border-primary-container",
  success: "border-status-success",
};
const toneText: Record<string, string> = {
  error: "text-status-error",
  warning: "text-status-warning",
  primary: "text-primary-container",
  success: "text-status-success",
};

function Agenda() {
  return (
    <AppLayout title="Agenda Operacional">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Gerenciamento de tarefas e solicitações internas.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STATUSES.map((s) => (
          <div key={s.label} className="bg-surface-low border border-border-low p-4 flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${s.color}`} />
            <span className="text-sm font-semibold">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-surface-container border border-border-low overflow-hidden">
          <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low">
            <h3 className="text-2xl font-semibold">Tarefas</h3>
            <button className="bg-primary-container text-on-primary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90">
              <Icon name="add" className="text-base" /> Nova Tarefa
            </button>
          </div>
          <ul className="divide-y divide-border-low">
            {TASKS.map((t) => (
              <li key={t.title} className={`p-5 border-l-4 ${toneBorder[t.tone]} hover:bg-surface-high transition-colors`}>
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <h4 className="font-semibold text-on-surface">{t.title}</h4>
                    <div className="text-xs text-on-surface-variant mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span><Icon name="construction" className="text-xs align-middle mr-1" />{t.equip}</span>
                      <span><Icon name="person" className="text-xs align-middle mr-1" />{t.resp}</span>
                      <span><Icon name="apartment" className="text-xs align-middle mr-1" />{t.sector}</span>
                      <span><Icon name="event" className="text-xs align-middle mr-1" />{t.deadline}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="px-2 py-1 text-[10px] uppercase tracking-wider border border-border-low text-on-surface-variant">{t.priority}</span>
                    <span className={`text-xs font-bold uppercase tracking-wider ${toneText[t.tone]}`}>{t.status}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface-container border border-border-low p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Icon name="add_task" className="text-primary-container" /> Nova Tarefa
          </h3>
          <form className="space-y-3">
            {[
              { label: "Título", type: "text" },
              { label: "Descrição", type: "textarea" },
              { label: "Equipamento", type: "select", options: ["Escavadeira CAT 320", "Trator Komatsu D61", "Caminhão Volvo FH-540"] },
              { label: "Responsável", type: "select", options: ["Davi", "Eduardo", "Equipe Mecânica"] },
              { label: "Setor", type: "select", options: ["Oficina", "Operacional", "Frota", "Administrativo", "Almoxarifado"] },
              { label: "Prioridade", type: "select", options: ["Baixa", "Média", "Alta", "Urgente"] },
              { label: "Prazo", type: "date" },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{f.label}</label>
                {f.type === "textarea" ? (
                  <textarea rows={3} className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container" />
                ) : f.type === "select" ? (
                  <select className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container">
                    {f.options!.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type} className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container" />
                )}
              </div>
            ))}
            <div>
              <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">Anexos</label>
              <div className="mt-1 border border-dashed border-border-low rounded p-4 text-center text-xs text-on-surface-variant">
                <Icon name="attach_file" className="text-base align-middle mr-1" /> Arraste arquivos ou clique para anexar
              </div>
            </div>
            <button type="button" className="w-full bg-primary-container text-on-primary font-bold py-2 mt-2 hover:opacity-90">
              Criar Tarefa
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
