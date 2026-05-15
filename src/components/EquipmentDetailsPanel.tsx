import { useState } from "react";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachedFile } from "@/components/AttachmentUpload";
import { toast } from "sonner";

export interface MaintenanceRecord {
  id: string;
  type: string;
  date: string;
  technician: string;
  status: "Concluída" | "Em andamento" | "Atrasada";
  deadline: string;
  description: string;
}

export interface EquipmentDetail {
  id: string;
  model: string;
  icon: string;
  hours: number;
  status: "Operação" | "Manutenção" | "Parado";
  tone: "success" | "warning" | "error";
  location: string;
  lastMaintenance: string;
  seriesNumber?: string;
  acquisitionDate?: string;
  manufacturer?: string;
  maintenanceRecords?: MaintenanceRecord[];
  attachments?: AttachedFile[];
  photos?: string[];
}

interface EquipmentDetailsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: EquipmentDetail | null;
}

const TONE_COLORS = {
  success: "text-status-success bg-status-success/10 border-status-success/30",
  warning: "text-status-warning bg-status-warning/10 border-status-warning/30",
  error: "text-status-error bg-status-error/10 border-status-error/30",
};

export function EquipmentDetailsPanel({
  open,
  onOpenChange,
  equipment,
}: EquipmentDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!equipment) return null;

  const statusIcon = {
    Operação: "check_circle",
    Manutenção: "build",
    Parado: "pause_circle",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[500px] md:w-[600px] max-h-screen overflow-y-auto">
        <SheetHeader className="space-y-3 pb-4 border-b border-border-low">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-surface-variant rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name={equipment.icon} className="text-primary text-5xl" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-2xl font-black tracking-tight">
                  {equipment.model}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${TONE_COLORS[equipment.tone]}`}>
                    <Icon name={statusIcon[equipment.status]} className="text-sm" />
                    {equipment.status}
                  </div>
                  <span className="text-xs font-mono text-on-surface-variant font-bold">
                    Frota {equipment.id}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast("Editando equipamento...")}
              >
                <Icon name="edit" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <Icon name="info" className="text-base" />
              <span className="hidden sm:inline text-xs">Visão</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-1">
              <Icon name="build" className="text-base" />
              <span className="hidden sm:inline text-xs">Manutenção</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1">
              <Icon name="attach_file" className="text-base" />
              <span className="hidden sm:inline text-xs">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-1">
              <Icon name="image" className="text-base" />
              <span className="hidden sm:inline text-xs">Fotos</span>
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Key Metrics */}
            <div className="space-y-3">
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                Informações Principais
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                    Horímetro
                  </p>
                  <p className="text-2xl font-black text-on-surface tracking-tighter">
                    {equipment.hours.toLocaleString("pt-BR")}
                    <span className="text-sm text-on-surface-variant ml-1">h</span>
                  </p>
                </div>

                <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                    Localização
                  </p>
                  <p className="text-sm font-bold text-on-surface flex items-center gap-1">
                    <Icon name="location_on" className="text-primary" />
                    {equipment.location}
                  </p>
                </div>

                <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                    Última Manutenção
                  </p>
                  <p className="text-sm font-bold text-on-surface">
                    {equipment.lastMaintenance}
                  </p>
                </div>

                <div className="bg-surface-highest/50 border border-border-low rounded-lg p-4">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                    Fabricante
                  </p>
                  <p className="text-sm font-bold text-on-surface">
                    {equipment.manufacturer || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Details */}
            {equipment.seriesNumber && (
              <div className="space-y-3 border-t border-border-low pt-4">
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                  Detalhes Técnicos
                </p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                      Número de Série
                    </dt>
                    <dd className="text-sm font-mono text-on-surface mt-1">
                      {equipment.seriesNumber}
                    </dd>
                  </div>
                  {equipment.acquisitionDate && (
                    <div>
                      <dt className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                        Data de Aquisição
                      </dt>
                      <dd className="text-sm font-mono text-on-surface mt-1">
                        {equipment.acquisitionDate}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-4 border-t border-border-low">
              <Button className="w-full font-black" onClick={() => toast("Agendando manutenção...")}>
                <Icon name="calendar_today" />
                Agendar Manutenção
              </Button>
              <Button
                variant="outline"
                className="w-full font-black"
                onClick={() => toast("Criando tarefa para este equipamento...")}
              >
                <Icon name="add_task" />
                Criar Tarefa
              </Button>
            </div>
          </TabsContent>

          {/* MAINTENANCE TAB */}
          <TabsContent value="maintenance" className="space-y-4 mt-6">
            {equipment.maintenanceRecords && equipment.maintenanceRecords.length > 0 ? (
              <div className="space-y-3">
                {equipment.maintenanceRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() =>
                      toast(record.type, {
                        description: `${record.status} em ${record.date}`,
                      })
                    }
                    className="w-full text-left border border-border-low rounded-lg p-4 hover:bg-surface-high transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="build" className="text-primary text-lg" />
                        <div>
                          <p className="font-bold text-on-surface">{record.type}</p>
                          <p className="text-xs text-on-surface-variant">
                            {record.technician}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          record.status === "Concluída"
                            ? "bg-status-success/10 text-status-success"
                            : record.status === "Em andamento"
                              ? "bg-primary/10 text-primary"
                              : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {record.status}
                      </div>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-2">
                      {record.description}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant">Realizado: {record.date}</span>
                      <span className="text-on-surface-variant">Prazo: {record.deadline}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Icon name="build" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
                <p className="text-on-surface-variant">Nenhum registro de manutenção</p>
              </div>
            )}
          </TabsContent>

          {/* DOCUMENTS TAB */}
          <TabsContent value="documents" className="space-y-4 mt-6">
            {equipment.attachments && equipment.attachments.length > 0 ? (
              <div className="space-y-2">
                {equipment.attachments.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toast("Baixando arquivo...", { description: file.name })}
                    className="w-full text-left border border-border-low rounded-lg p-3 hover:bg-surface-high transition-colors flex items-center gap-3 group"
                  >
                    <div className="p-2 bg-surface-lowest rounded flex-shrink-0">
                      <Icon
                        name={
                          file.type === "image"
                            ? "image"
                            : file.type === "pdf"
                              ? "picture_as_pdf"
                              : "description"
                        }
                        className="text-primary text-lg"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Icon name="download" className="text-on-surface-variant text-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Icon name="folder_open" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
                <p className="text-on-surface-variant">Nenhum documento anexado</p>
              </div>
            )}
          </TabsContent>

          {/* PHOTOS TAB */}
          <TabsContent value="photos" className="space-y-4 mt-6">
            {equipment.photos && equipment.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {equipment.photos.map((photo, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toast("Visualizando foto...")}
                    className="relative h-32 rounded-lg overflow-hidden border border-border-low hover:border-primary/50 transition-colors group"
                  >
                    <img
                      src={photo}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Icon name="zoom_in" className="text-white text-3xl" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Icon name="image" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
                <p className="text-on-surface-variant">Nenhuma foto disponível</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
