import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/agenda")({ component: Agenda });

type Tone = "error" | "warning" | "primary" | "success" | "pending";
type Task = {
  id: string;
  title: string;
  description?: string;
  equip: string;
  resp: string;
  sector: string;
  priority: string;
  deadline: string;
  status: string;
  tone: Tone;
  attachments?: string[];
  createdAt: string;
};

const STATUSES: { color: string; label: string }[] = [
  { color: "bg-status-error", label: "Atrasado" },
  { color: "bg-status-warning", label: "Próximo do prazo" },
  { color: "bg-primary-container", label: "Em andamento" },
  { color: "bg-status-success", label: "Finalizado" },
];

const INITIAL_TASKS: Task[] = [
  { id: "TK-0512", title: "Inspeção semanal pá carregadeira", equip: "CAT 950", resp: "Eduardo", sector: "Operacional", priority: "Média", deadline: "16/05/2026", status: "Próximo do prazo", tone: "warning", createdAt: "14/05/2026" },
  { id: "TK-0511", title: "Atualizar planilha de horímetros", equip: "—", resp: "Davi", sector: "Administrativo", priority: "Baixa", deadline: "17/05/2026", status: "Em andamento", tone: "primary", createdAt: "13/05/2026" },
  { id: "TK-0509", title: "Conferência de estoque almoxarifado", equip: "—", resp: "Davi", sector: "Almoxarifado", priority: "Baixa", deadline: "10/05/2026", status: "Finalizado", tone: "success", createdAt: "08/05/2026" },
];

const toneBorder: Record<Tone, string> = {
  error: "border-status-error",
  warning: "border-status-warning",
  primary: "border-primary-container",
  success: "border-status-success",
  pending: "border-outline",
};
const toneText: Record<Tone, string> = {
  error: "text-status-error",
  warning: "text-status-warning",
  primary: "text-primary-container",
  success: "text-status-success",
  pending: "text-on-surface-variant",
};
const toneBg: Record<Tone, string> = {
  error: "bg-status-error/10 text-status-error border-status-error/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  primary: "bg-primary-container/10 text-primary-container border-primary-container/30",
  success: "bg-status-success/10 text-status-success border-status-success/30",
  pending: "bg-surface-high text-on-surface-variant border-outline/40",
};

function Agenda() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [pending, setPending] = useState<Task[]>([
    {
      id: "SL-0021",
      title: "Vazamento de óleo na transmissão",
      description: "Identificado vazamento durante operação matinal. Necessário diagnóstico antes de novo turno.",
      equip: "Caminhão Volvo FH-540",
      resp: "Equipe Mecânica",
      sector: "Frota",
      priority: "Urgente",
      deadline: "16/05/2026",
      status: "Aguardando aprovação",
      tone: "pending",
      attachments: ["foto_vazamento.jpg"],
      createdAt: "Hoje · 09:42",
    },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | Tone>("all");

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.tone === filter);

  function approveRequest(id: string) {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setPending((p) => p.filter((x) => x.id !== id));
    setTasks((t) => [
      { ...item, id: `TK-${Math.floor(Math.random() * 9000) + 1000}`, status: "Em andamento", tone: "primary" },
      ...t,
    ]);
    toast.success("Solicitação aprovada", { description: `${item.title} foi convertida em tarefa.` });
  }

  function rejectRequest(id: string) {
    const item = pending.find((p) => p.id === id);
    setPending((p) => p.filter((x) => x.id !== id));
    toast.error("Solicitação recusada", { description: item?.title });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const novo: Task = {
      id: `SL-${Math.floor(Math.random() * 9000) + 1000}`,
      title: (fd.get("title") || "Nova solicitação").toString(),
      description: (fd.get("description") || "").toString(),
      equip: (fd.get("equip") || "—").toString(),
      resp: (fd.get("resp") || "—").toString(),
      sector: (fd.get("sector") || "—").toString(),
      priority: (fd.get("priority") || "Média").toString(),
      deadline: (fd.get("deadline") || "—").toString(),
      status: "Aguardando aprovação",
      tone: "pending",
      createdAt: "Agora",
    };
    setPending((p) => [novo, ...p]);
    setShowForm(false);
    toast.success("Solicitação enviada", {
      description: `${novo.title} entrou na fila de pendências.`,
    });
    e.currentTarget.reset();
  }

  return (
    <AppLayout title="Agenda Operacional">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Gerenciamento de tarefas e solicitações internas. As manutenções da frota são geridas em{" "}
        <span className="text-primary-container font-semibold">Manutenção</span> e não aparecem aqui.
      </p>

      {/* Status legend - clickable filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`bg-surface-low border p-3 flex items-center gap-3 text-left transition-colors ${filter === "all" ? "border-primary-container" : "border-border-low hover:border-outline"}`}
        >
          <Icon name="filter_alt" className="text-primary-container" />
          <span className="text-sm font-semibold">Todos</span>
        </button>
        {STATUSES.map((s) => {
          const tone: Tone = s.label === "Atrasado" ? "error" : s.label === "Próximo do prazo" ? "warning" : s.label === "Em andamento" ? "primary" : "success";
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setFilter(tone)}
              className={`bg-surface-low border p-3 flex items-center gap-3 text-left transition-colors ${filter === tone ? "border-primary-container" : "border-border-low hover:border-outline"}`}
            >
              <span className={`w-3 h-3 rounded-full ${s.color}`} />
              <span className="text-sm font-semibold">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Solicitações Pendentes */}
      <section className="mb-8 bg-surface-container border border-outline/40 overflow-hidden">
        <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warning animate-pulse" />
            <h3 className="text-2xl font-semibold">Solicitações Pendentes</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-status-warning/20 text-status-warning font-bold">{pending.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary-container text-on-primary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90 active:scale-95 transition"
          >
            <Icon name={showForm ? "close" : "add"} className="text-base" /> {showForm ? "Cancelar" : "Nova Solicitação"}
          </button>
        </div>

        {pending.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant">Nenhuma solicitação pendente no momento.</p>
        ) : (
          <ul className="divide-y divide-border-low">
            {pending.map((p) => (
              <li key={p.id} className="p-5 border-l-4 border-status-warning bg-status-warning/[0.03]">
                <div className="flex justify-between items-start gap-4 flex-wrap mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-surface-high text-on-surface-variant rounded">#{p.id}</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-status-warning">Aguardando aprovação</span>
                    </div>
                    <h4 className="font-bold text-on-surface text-lg">{p.title}</h4>
                    {p.description && <p className="text-sm text-on-surface-variant mt-1">{p.description}</p>}
                  </div>
                  <span className="text-xs text-on-surface-variant whitespace-nowrap">{p.createdAt}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mb-4">
                  <Field icon="construction" label="Equipamento" value={p.equip} />
                  <Field icon="person" label="Responsável" value={p.resp} />
                  <Field icon="apartment" label="Setor" value={p.sector} />
                  <Field icon="priority_high" label="Prioridade" value={p.priority} />
                  <Field icon="event" label="Prazo" value={p.deadline} />
                </div>
                {p.attachments && p.attachments.length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {p.attachments.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toast("Anexo", { description: a })}
                        className="flex items-center gap-1 px-2 py-1 bg-surface-high text-xs text-on-surface-variant hover:text-on-surface border border-border-low rounded"
                      >
                        <Icon name="attach_file" className="text-xs" /> {a}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => approveRequest(p.id)}
                    className="bg-status-success text-white px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90 active:scale-95 transition"
                  >
                    <Icon name="check" className="text-base" /> Aprovar e gerar tarefa
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectRequest(p.id)}
                    className="bg-surface-high text-status-error border border-status-error/40 px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-status-error/10 transition"
                  >
                    <Icon name="close" className="text-base" /> Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => toast("Detalhes", { description: `Abrindo ${p.id}` })}
                    className="border border-border-low px-4 py-2 text-sm font-semibold hover:bg-surface-high transition"
                  >
                    Ver detalhes
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tasks list */}
        <div className="lg:col-span-2 bg-surface-container border border-border-low overflow-hidden">
          <div className="p-6 border-b border-border-low flex justify-between items-center bg-surface-low gap-2 flex-wrap">
            <h3 className="text-2xl font-semibold">Tarefas Aprovadas</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toast("Exportar", { description: "Gerando CSV das tarefas…" })}
                className="border border-border-low px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-surface-high"
              >
                <Icon name="download" className="text-base" /> Exportar
              </button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-on-surface-variant">Nenhuma tarefa neste filtro.</p>
          ) : (
            <ul className="divide-y divide-border-low">
              {filtered.map((t) => (
                <li key={t.id} className={`p-5 border-l-4 ${toneBorder[t.tone]} hover:bg-surface-high transition-colors`}>
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-surface-high text-on-surface-variant rounded">#{t.id}</span>
                      </div>
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
                      <button
                        type="button"
                        onClick={() => toast(t.title, { description: `Status: ${t.status}` })}
                        className="text-on-surface-variant hover:text-primary-container p-1"
                      >
                        <Icon name="more_vert" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New request form */}
        <div className={`bg-surface-container border ${showForm ? "border-primary-container/60" : "border-border-low"} p-6 transition`}>
          <h3 className="text-xl font-semibold mb-1 flex items-center gap-2">
            <Icon name="add_task" className="text-primary-container" /> Nova Solicitação
          </h3>
          <p className="text-xs text-on-surface-variant mb-4">
            Preencha para enviar uma pendência. Após aprovação ela vira uma tarefa.
          </p>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <Input name="title" label="Título" required />
            <Input name="description" label="Descrição" type="textarea" />
            <Select name="equip" label="Equipamento" options={["—", "Escavadeira CAT 320", "Trator Komatsu D61", "Caminhão Volvo FH-540", "Pá Carregadeira CAT 950"]} />
            <Select name="resp" label="Responsável" options={["Davi", "Eduardo", "Equipe Mecânica"]} />
            <Select name="sector" label="Setor" options={["Oficina", "Operacional", "Frota", "Administrativo", "Almoxarifado"]} />
            <Select name="priority" label="Prioridade" options={["Baixa", "Média", "Alta", "Urgente"]} />
            <Input name="deadline" label="Prazo" type="date" />
            <div>
              <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">Anexos</label>
              <button
                type="button"
                onClick={() => toast("Anexar", { description: "Selecione arquivos do dispositivo." })}
                className="mt-1 w-full border border-dashed border-border-low rounded p-4 text-center text-xs text-on-surface-variant hover:border-primary-container hover:text-on-surface transition"
              >
                <Icon name="attach_file" className="text-base align-middle mr-1" /> Clique para anexar arquivos
              </button>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 bg-primary-container text-on-primary font-bold py-2 hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-2"
              >
                <Icon name="send" className="text-base" /> Enviar Solicitação
              </button>
              <button
                type="reset"
                className="border border-border-low px-4 py-2 text-sm font-semibold hover:bg-surface-high"
              >
                Limpar
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-surface-low p-2.5 border border-border-low/50">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-on-surface-variant">
        <Icon name={icon} className="text-xs" /> {label}
      </div>
      <div className="text-sm text-on-surface font-semibold mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Input({ name, label, type = "text", required }: { name: string; label: string; type?: string; required?: boolean }) {
  if (type === "textarea") {
    return (
      <div>
        <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{label}</label>
        <textarea name={name} rows={3} required={required} className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container" />
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{label}</label>
      <input name={name} type={type} required={required} className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container" />
    </div>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{label}</label>
      <select name={name} className="mt-1 w-full bg-surface-highest border border-border-low rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary-container">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
