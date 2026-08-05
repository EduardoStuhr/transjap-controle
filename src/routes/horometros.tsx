import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import {
  Clock,
  QrCode,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Download,
  Trash2,
  RefreshCw,
  HardHat,
  MapPin,
  Calendar,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listHorometroLogs, deleteHorometroLog, type HorometroLogCreate } from "@/lib/api/horometro";
import { formatFleetCode, normalizeFleetId } from "@/lib/operational-options";
import type { DbHorometroLog } from "@/db/schema";
import QRCode from "qrcode";

export const Route = createFileRoute("/horometros")({
  component: HorometrosDashboardPage,
});

function HorometrosDashboardPage() {
  const [logs, setLogs] = useState<DbHorometroLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchFleet, setSearchFleet] = useState("");
  const [selectedObra, setSelectedObra] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Modal for photo audit
  const [selectedLogForAudit, setSelectedLogForAudit] = useState<DbHorometroLog | null>(null);

  // Modal for QR Code generator
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrFleetNum, setQrFleetNum] = useState("16");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await listHorometroLogs({});
      setLogs(data as DbHorometroLog[]);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar registros de horômetro.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Generate QR code preview
  useEffect(() => {
    if (qrFleetNum) {
      const numOnly = qrFleetNum.replace(/\D/g, "") || "16";
      const paddedNum = numOnly.padStart(4, "0");
      QRCode.toDataURL(paddedNum, { width: 300, margin: 2 }, (err, url) => {
        if (!err && url) setQrDataUrl(url);
      });
    }
  }, [qrFleetNum]);

  // Unique Obras list
  const obrasList = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.obra) set.add(log.obra);
    });
    return Array.from(set);
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (searchFleet.trim()) {
        const query = searchFleet.trim().toLowerCase();
        const matchesFleet =
          log.fleet.toLowerCase().includes(query) ||
          log.fleetLabel.toLowerCase().includes(query) ||
          log.fleet.replace(/\D/g, "").includes(query);
        if (!matchesFleet) return false;
      }
      if (selectedObra !== "all" && log.obra !== selectedObra) {
        return false;
      }
      if (selectedStatus !== "all" && log.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [logs, searchFleet, selectedObra, selectedStatus]);

  // Stats
  const totalLeituras = logs.length;
  const leiturasAprovadas = logs.filter((l) => l.status === "aprovado").length;
  const leiturasPendentes = logs.filter((l) => l.status === "pendente_revisao").length;

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro de horômetro?")) return;
    try {
      await deleteHorometroLog({ data: id });
      setLogs((prev) => prev.filter((l) => l.id !== id));
      toast.success("Registro removido!");
    } catch (e) {
      toast.error("Falha ao excluir registro.");
    }
  };

  return (
    <AppLayout title="Controle de Horômetros &amp; IA" currentTab="horometros">
      <div className="space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Clock className="w-6 h-6 text-amber-500" />
              <span>Controle de Horômetros da Frota</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento em tempo real de leituras via QR Code e Visão Computacional / IA de campo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadLogs}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setQrModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>Gerador de QR Code</span>
            </Button>
            <a
              href="/operador"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold shadow transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir App Operador</span>
            </a>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Total de Leituras</span>
              <span className="text-2xl font-bold text-foreground">{totalLeituras}</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Aprovadas por IA</span>
              <span className="text-2xl font-bold text-emerald-500">{leiturasAprovadas}</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Pendentes de Revisão</span>
              <span className="text-2xl font-bold text-amber-400">{leiturasPendentes}</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Frotas no Cadastro</span>
              <span className="text-2xl font-bold text-blue-500">298 Máquinas</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por Frota (ex: 16, 0016)..."
              value={searchFleet}
              onChange={(e) => setSearchFleet(e.target.value)}
              className="w-full bg-background border border-input rounded-md py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Obra filter */}
            <div className="w-44">
              <Select value={selectedObra} onValueChange={setSelectedObra}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todas as Obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Obras</SelectItem>
                  {obrasList.map((obra) => (
                    <SelectItem key={obra} value={obra}>
                      {obra}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-40">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="aprovado">Aprovados (IA)</SelectItem>
                  <SelectItem value="pendente_revisao">Pendente Revisão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
              <span>Carregando registros de horômetro...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground space-y-2">
              <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="font-semibold text-foreground">Nenhum registro encontrado</p>
              <p className="text-xs">
                As leituras realizadas pelos operadores via celular/QR Code aparecerão aqui em tempo real.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Foto</th>
                    <th className="px-4 py-3">Frota</th>
                    <th className="px-4 py-3">Obra</th>
                    <th className="px-4 py-3">Horômetro Lido</th>
                    <th className="px-4 py-3">Confiança IA</th>
                    <th className="px-4 py-3">Operador</th>
                    <th className="px-4 py-3">Data / Hora</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      {/* Photo Thumbnail */}
                      <td className="px-4 py-2.5">
                        {log.photoUrl ? (
                          <button
                            type="button"
                            onClick={() => setSelectedLogForAudit(log)}
                            className="w-12 h-12 rounded-lg border border-border overflow-hidden bg-black relative group shadow-sm"
                          >
                            <img
                              src={log.photoUrl}
                              alt="Horômetro"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <Eye className="w-4 h-4" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground text-[10px]">
                            Sem foto
                          </div>
                        )}
                      </td>

                      {/* Fleet Code */}
                      <td className="px-4 py-2.5 font-bold text-foreground">
                        <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-1 rounded-md font-mono">
                          <QrCode className="w-3.5 h-3.5" />
                          {log.fleetLabel || formatFleetCode(log.fleet)}
                        </span>
                      </td>

                      {/* Obra */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 text-foreground font-medium">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{log.obra || "Não informada"}</span>
                        </div>
                      </td>

                      {/* Horometro Value */}
                      <td className="px-4 py-2.5 font-mono text-sm font-bold text-amber-400">
                        {log.horometroValue.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                        })}{" "}
                        h
                      </td>

                      {/* IA Confidence Badge */}
                      <td className="px-4 py-2.5">
                        {log.ocrConfidence && log.ocrConfidence >= 0.8 ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium text-[11px]">
                            <ShieldCheck className="w-3 h-3" />
                            {Math.round(log.ocrConfidence * 100)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            {Math.round((log.ocrConfidence || 0.5) * 100)}% (Manual)
                          </span>
                        )}
                      </td>

                      {/* Operator */}
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{log.operatorName}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {new Date(log.createdAt).toLocaleDateString("pt-BR")}{" "}
                            {new Date(log.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2.5 text-right space-x-2">
                        {log.photoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLogForAudit(log)}
                            className="h-8 px-2 text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Foto</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(log.id)}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal AUDIT PHOTO */}
        <Dialog
          open={!!selectedLogForAudit}
          onOpenChange={(open) => !open && setSelectedLogForAudit(null)}
        >
          <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-amber-400">
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" /> Auditoria de Foto - {selectedLogForAudit?.fleetLabel}
                </span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Foto original tirada pelo operador no momento da leitura do horômetro.
              </DialogDescription>
            </DialogHeader>

            {selectedLogForAudit && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
                {/* Photo */}
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-black aspect-square flex items-center justify-center">
                  <img
                    src={selectedLogForAudit.photoUrl || ""}
                    alt="Foto do Horômetro"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Details */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                        Horômetro Registrado
                      </span>
                      <span className="text-3xl font-mono font-bold text-amber-400">
                        {selectedLogForAudit.horometroValue} h
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-slate-500 block">Frota:</span>
                        <strong className="text-slate-200">{selectedLogForAudit.fleetLabel}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Obra:</span>
                        <strong className="text-slate-200">{selectedLogForAudit.obra || "-"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Operador:</span>
                        <strong className="text-slate-200">{selectedLogForAudit.operatorName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Confiança IA:</span>
                        <strong className="text-emerald-400">
                          {Math.round((selectedLogForAudit.ocrConfidence || 1) * 100)}%
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
                    <span className="font-semibold text-slate-300 block">Detalhes Adicionais:</span>
                    <p>
                      Data: {new Date(selectedLogForAudit.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {selectedLogForAudit.rawOcrText && (
                      <p className="font-mono text-[11px] text-amber-300/80">
                        Texto bruto OCR: {selectedLogForAudit.rawOcrText}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal GENERATE QR CODE */}
        <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
          <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <QrCode className="w-5 h-5" /> Gerador de QR Code da Frota
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Gere e imprima adesivos QR Code no padrão do sistema (0001 a 0298) para aplicar nas frotas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <label className="text-xs text-slate-300">Número da Frota:</label>
                <input
                  type="text"
                  value={qrFleetNum}
                  onChange={(e) => setQrFleetNum(e.target.value)}
                  placeholder="Ex: 16"
                  className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-amber-400 w-24 text-center font-bold"
                />
              </div>

              {qrDataUrl && (
                <div className="bg-white p-6 rounded-2xl border-4 border-slate-800 inline-block shadow-xl">
                  <img src={qrDataUrl} alt="QR Code Frota" className="w-48 h-48 mx-auto" />
                  <span className="block mt-2 font-mono font-bold text-lg text-slate-950">
                    FROTA {qrFleetNum.replace(/\D/g, "").padStart(4, "0")}
                  </span>
                </div>
              )}

              <div className="flex justify-center gap-2 pt-2">
                <a
                  href={qrDataUrl}
                  download={`QR_CODE_FROTA_${qrFleetNum.padStart(4, "0")}.png`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar QR Code</span>
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
