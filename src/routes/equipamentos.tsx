import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  EquipmentDetailsPanel,
  type EquipmentDetail,
  type MaintenanceRecord,
} from "@/components/EquipmentDetailsPanel";

export const Route = createFileRoute("/equipamentos")({ component: Equipamentos });

const FLEET_DATA = [
  {
    id: "FR-001",
    model: "Escavadeira CAT 320",
    icon: "snowmobile",
    hours: 8420,
    status: "Operação" as const,
    tone: "success" as const,
    location: "Obra Norte",
    lastMaintenance: "12/05/2026",
    seriesNumber: "CAT320-2019-001",
    acquisitionDate: "01/03/2019",
    manufacturer: "Caterpillar",
    maintenanceRecords: [
      {
        id: "1",
        type: "Preventiva",
        date: "12/05/2026",
        technician: "Equipe técnica",
        status: "Concluída" as const,
        deadline: "12/05/2026",
        description: "Troca de óleo e filtros",
      },
      {
        id: "2",
        type: "Sistema Hidráulico",
        date: "05/05/2026",
        technician: "Equipe técnica",
        status: "Concluída" as const,
        deadline: "05/05/2026",
        description: "Revisão completa",
      },
    ] as MaintenanceRecord[],
  },
  {
    id: "FR-002",
    model: "Caminhão Volvo FH-540",
    icon: "local_shipping",
    hours: 12345,
    status: "Manutenção" as const,
    tone: "warning" as const,
    location: "Oficina",
    lastMaintenance: "10/05/2026",
    seriesNumber: "VOLVO-FH540-2018-002",
    acquisitionDate: "15/08/2018",
    manufacturer: "Volvo",
    maintenanceRecords: [
      {
        id: "3",
        type: "Revisão 50k",
        date: "10/05/2026",
        technician: "Workshop Team",
        status: "Em andamento" as const,
        deadline: "15/05/2026",
        description: "Manutenção programada de 50 mil km",
      },
    ] as MaintenanceRecord[],
  },
  {
    id: "FR-003",
    model: "Trator Komatsu D61",
    icon: "agriculture",
    hours: 5210,
    status: "Operação" as const,
    tone: "success" as const,
    location: "Obra Sul",
    lastMaintenance: "08/05/2026",
    seriesNumber: "KOMATSU-D61-2020-003",
    acquisitionDate: "22/11/2020",
    manufacturer: "Komatsu",
  },
  {
    id: "FR-004",
    model: "Pá Carregadeira CAT 950",
    icon: "construction",
    hours: 9876,
    status: "Parado" as const,
    tone: "error" as const,
    location: "Pátio",
    lastMaintenance: "05/05/2026",
    seriesNumber: "CAT950-2017-004",
    acquisitionDate: "10/07/2017",
    manufacturer: "Caterpillar",
  },
  {
    id: "FR-005",
    model: "Empilhadeira Hyster H80",
    icon: "forklift",
    hours: 3210,
    status: "Operação" as const,
    tone: "success" as const,
    location: "Almoxarifado",
    lastMaintenance: "04/05/2026",
    seriesNumber: "HYSTER-H80-2021-005",
    acquisitionDate: "14/02/2021",
    manufacturer: "Hyster",
  },
];

const toneBg: Record<string, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  error: "bg-status-error/10 text-status-error border-status-error/30",
};

function Equipamentos() {
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentDetail | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = FLEET_DATA.filter(
    (e) =>
      e.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.location.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const openEquipmentDetails = (equipment: (typeof FLEET_DATA)[0]) => {
    const detail: EquipmentDetail = {
      ...equipment,
    };
    setSelectedEquipment(detail);
    setShowDetailsPanel(true);
  };

  const statusCounts = {
    operacao: FLEET_DATA.filter((e) => e.status === "Operação").length,
    manutencao: FLEET_DATA.filter((e) => e.status === "Manutenção").length,
    parado: FLEET_DATA.filter((e) => e.status === "Parado").length,
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">
            Frota de Equipamentos
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">
            {FLEET_DATA.length} máquinas cadastradas
          </p>
        </div>
        <Button
          onClick={() =>
            toast("Novo equipamento...", { description: "Abrindo formulário de cadastro" })
          }
          className="font-black gap-2 shadow-industrial"
        >
          <Icon name="add" />
          Cadastrar Equipamento
        </Button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-status-success/10 border border-status-success/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="check_circle" className="text-status-success text-2xl" />
            <p className="text-[10px] font-black text-status-success uppercase tracking-widest">
              Em Operação
            </p>
          </div>
          <p className="text-3xl font-black text-status-success">{statusCounts.operacao}</p>
        </div>
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="build" className="text-status-warning text-2xl" />
            <p className="text-[10px] font-black text-status-warning uppercase tracking-widest">
              Manutenção
            </p>
          </div>
          <p className="text-3xl font-black text-status-warning">{statusCounts.manutencao}</p>
        </div>
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="pause_circle" className="text-status-error text-2xl" />
            <p className="text-[10px] font-black text-status-error uppercase tracking-widest">
              Parado
            </p>
          </div>
          <p className="text-3xl font-black text-status-error">{statusCounts.parado}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8">
        <Icon
          name="search"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
        />
        <input
          type="text"
          placeholder="Buscar por modelo, série ou localização..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-surface-container border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial placeholder:text-on-surface-variant/50"
        />
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((e) => (
          <button
            type="button"
            key={e.id}
            onClick={() => openEquipmentDetails(e)}
            className="text-left bg-surface-container border border-border-low p-6 rounded-lg hover:border-primary/50 hover:shadow-md transition-industrial group relative overflow-hidden"
          >
            {/* Status indicator bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex justify-between items-start mb-4">
              <div className="w-16 h-16 bg-surface-variant rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name={e.icon} className="text-primary text-4xl" />
              </div>
              <span className={`px-3 py-1 text-xs font-bold rounded-full border ${toneBg[e.tone]}`}>
                {e.status}
              </span>
            </div>

            <p className="text-xs uppercase tracking-wider text-on-surface-variant font-medium mb-1">
              Frota {e.id}
            </p>
            <h3 className="text-lg font-black text-on-surface group-hover:text-primary transition-colors mb-4">
              {e.model}
            </h3>

            <dl className="grid grid-cols-2 gap-4 text-xs mb-4 pb-4 border-b border-border-low">
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant font-black mb-1">
                  <Icon name="schedule" className="inline text-base mr-1" />
                  Horímetro
                </dt>
                <dd className="text-on-surface font-black">{e.hours.toLocaleString("pt-BR")} h</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant font-black mb-1">
                  <Icon name="location_on" className="inline text-base mr-1" />
                  Localização
                </dt>
                <dd className="text-on-surface font-black truncate">{e.location}</dd>
              </div>
              <div className="col-span-2">
                <dt className="uppercase tracking-wider text-on-surface-variant font-black mb-1">
                  <Icon name="build" className="inline text-base mr-1" />
                  Última Manutenção
                </dt>
                <dd className="text-on-surface font-black">{e.lastMaintenance}</dd>
              </div>
            </dl>

            <div className="flex gap-2 text-xs font-black text-primary uppercase tracking-widest">
              <Icon name="arrow_forward" />
              Ver Detalhes
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Icon
            name="precision_manufacturing"
            className="text-5xl text-on-surface-variant/30 mx-auto mb-3"
          />
          <p className="text-on-surface-variant">Nenhum equipamento encontrado</p>
        </div>
      )}

      {/* Details Panel */}
      <EquipmentDetailsPanel
        open={showDetailsPanel}
        onOpenChange={setShowDetailsPanel}
        equipment={selectedEquipment}
      />
    </AppLayout>
  );
}
