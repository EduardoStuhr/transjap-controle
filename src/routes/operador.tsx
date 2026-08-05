import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  Upload,
  ArrowRight,
  HardHat,
  MapPin,
  Clock,
  ShieldCheck,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeFleetId, formatFleetCode } from "@/lib/operational-options";
import { createHorometroLog, processHorometroOCR } from "@/lib/api/horometro";
import { listEquipment } from "@/lib/api/equipment";

export const Route = createFileRoute("/operador")({
  component: OperadorMobilePage,
});

function OperadorMobilePage() {
  const [operatorName, setOperatorName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("transjap_operator_name") || "";
    }
    return "";
  });

  const [step, setStep] = useState<"fleet" | "photo" | "review" | "success">("fleet");
  const [fleetInput, setFleetInput] = useState("");
  const [selectedFleet, setSelectedFleet] = useState<{
    id: string;
    label: string;
    model: string;
    location: string;
    hours: number;
  } | null>(null);

  const [equipmentsList, setEquipmentsList] = useState<Array<any>>([]);
  const [selectedObra, setSelectedObra] = useState("");

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [horometroValue, setHorometroValue] = useState<string>("");
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number>(1.0);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [qrScanningActive, setQrScanningActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load equipments on mount
  useEffect(() => {
    listEquipment()
      .then((data) => {
        if (Array.isArray(data)) {
          setEquipmentsList(data);
        }
      })
      .catch((err) => console.error("Erro ao carregar equipamentos:", err));
  }, []);

  useEffect(() => {
    if (operatorName && typeof window !== "undefined") {
      localStorage.setItem("transjap_operator_name", operatorName);
    }
  }, [operatorName]);

  // Handle fleet resolution (e.g. "16", "0016", "FR-016", "http://.../0016")
  const resolveAndSelectFleet = (rawText: string) => {
    let cleaned = rawText.trim();
    if (cleaned.includes("/")) {
      cleaned = cleaned.split("/").pop() || cleaned;
    }
    const normId = normalizeFleetId(cleaned);
    const numOnly = normId.replace(/\D/g, "");

    const match = equipmentsList.find(
      (e) =>
        e.id === normId ||
        e.id.replace(/\D/g, "") === numOnly ||
        normalizeFleetId(e.id) === normId,
    );

    const fleetLabel = formatFleetCode(normId) || `Frota ${numOnly || rawText}`;

    setSelectedFleet({
      id: normId,
      label: fleetLabel,
      model: match?.model || `Equipamento ${fleetLabel}`,
      location: match?.location || "CAMPO_LCO_05",
      hours: match?.hours || 0,
    });
    setSelectedObra(match?.location || "CAMPO_LCO_05");
    setStep("photo");
    toast.success(`${fleetLabel} selecionada!`);
  };

  // QR Code Camera scanner simulator / WebRTC Camera
  const startQrCamera = async () => {
    setQrScanningActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e) {
      console.warn("Câmera não permitida ou indisponível:", e);
      toast.info("Digite o número da frota manualmente abaixo.");
    }
  };

  const stopQrCamera = () => {
    setQrScanningActive(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Capture photo of horometro
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setPhotoBase64(base64);
      setStep("review");
      runOcrProcess(base64);
    };
    reader.readAsDataURL(file);
  };

  // Process image with Gemini Vision AI OCR
  const runOcrProcess = async (base64: string) => {
    setIsProcessingOcr(true);
    setOcrConfidence(1.0);
    try {
      const res = await processHorometroOCR({ data: { imageBase64: base64 } });
      if (res.success && res.horometroValue !== undefined) {
        setHorometroValue(res.horometroValue.toString());
        setOcrConfidence(res.confidence);
        setOcrRawText(res.rawText || "");
        toast.success(`Horômetro lido com sucesso: ${res.horometroValue} h`);
      } else {
        toast.warning("Não foi possível ler o valor com clareza. Digite manualmente abaixo.");
        if (selectedFleet?.hours) {
          setHorometroValue((selectedFleet.hours + 8).toString());
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler foto com IA. Digite a leitura manualmente.");
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Submit horometro log
  const handleSubmitLog = async () => {
    if (!selectedFleet) return;
    const val = parseFloat(horometroValue);
    if (isNaN(val) || val <= 0) {
      toast.error("Informe um valor válido de horômetro!");
      return;
    }

    setIsSubmitting(true);
    try {
      await createHorometroLog({
        data: {
          fleet: selectedFleet.id,
          obra: selectedObra,
          horometroValue: val,
          type: "leitura",
          photoUrl: photoBase64 || undefined,
          ocrConfidence: ocrConfidence,
          operatorName: operatorName || "Operador de Campo",
        },
      });

      setStep("success");
      toast.success("Registro de horômetro salvo no sistema!");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao salvar horômetro. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep("fleet");
    setFleetInput("");
    setSelectedFleet(null);
    setPhotoBase64(null);
    setHorometroValue("");
    stopQrCamera();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg font-black tracking-wider text-xs">
            TRANSJAP
          </div>
          <span className="font-semibold text-sm text-slate-200">Operador Mobile</span>
        </div>
        <div className="flex items-center gap-2">
          <HardHat className="w-4 h-4 text-amber-400" />
          <input
            type="text"
            placeholder="Seu Nome..."
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 w-28 text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center">
        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-between px-2">
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              step === "fleet" ? "text-amber-400 font-bold" : "text-slate-400"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Frota</span>
          </div>
          <div className="h-[1px] flex-1 bg-slate-800 mx-2" />
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              step === "photo" ? "text-amber-400 font-bold" : "text-slate-400"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Foto</span>
          </div>
          <div className="h-[1px] flex-1 bg-slate-800 mx-2" />
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              step === "review" || step === "success" ? "text-amber-400 font-bold" : "text-slate-400"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              3
            </span>
            <span>Confirmação</span>
          </div>
        </div>

        {/* STEP 1: FLEET SCAN / SELECT */}
        {step === "fleet" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Identificar Frota</h2>
              <p className="text-xs text-slate-400">
                Aproxime do QR Code da máquina ou digite a frota (ex: 0016 ou 16)
              </p>
            </div>

            {/* QR Scanner view or button */}
            {qrScanningActive ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square border-2 border-amber-500/50 flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-amber-400/70 m-8 rounded-lg pointer-events-none animate-pulse flex items-center justify-center">
                  <span className="text-[10px] bg-slate-900/80 px-2 py-1 rounded text-amber-300 font-mono">
                    Posicione o QR Code aqui
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopQrCamera}
                  className="absolute bottom-3 bg-slate-900/90 text-slate-300 px-3 py-1.5 rounded-lg text-xs border border-slate-700"
                >
                  Fechar Câmera
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startQrCamera}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <QrCode className="w-5 h-5" />
                <span>Escanear QR Code da Frota</span>
              </button>
            )}

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-widest font-mono">
                Ou Digite Abaixo
              </span>
            </div>

            {/* Manual Fleet input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (fleetInput.trim()) resolveAndSelectFleet(fleetInput);
              }}
              className="space-y-3"
            >
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Número da Frota (ex: 16 ou 0016)..."
                  value={fleetInput}
                  onChange={(e) => setFleetInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={!fleetInput.trim()}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
              >
                <span>Selecionar Máquina</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Suggestions grid */}
            <div className="pt-2">
              <span className="text-[11px] text-slate-400 block mb-2 font-medium">
                Frotas Frequentes:
              </span>
              <div className="grid grid-cols-4 gap-2">
                {["16", "18", "25", "42", "105", "180", "220", "298"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => resolveAndSelectFleet(f)}
                    className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-mono text-amber-400 hover:border-amber-500/40 transition-colors"
                  >
                    F-{f.padStart(3, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: TAKE HOROMETRO PHOTO */}
        {step === "photo" && selectedFleet && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Fleet details card */}
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                  Máquina Selecionada
                </span>
                <h3 className="text-base font-bold text-slate-100">{selectedFleet.label}</h3>
                <p className="text-xs text-slate-400">{selectedFleet.model}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep("fleet")}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Trocar
              </button>
            </div>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-2">
                <Camera className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Foto do Horômetro</h2>
              <p className="text-xs text-slate-400">
                Tire uma foto clara do painel ou marcador de horas do equipamento
              </p>
            </div>

            {/* Hidden file input with camera trigger */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handlePhotoCapture}
              className="hidden"
            />

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span>Tirar Foto Agora</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Ou escolher foto da galeria</span>
              </button>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Nossa IA identificará o valor do horômetro automaticamente após a foto ser tirada.
              </span>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & CONFIRM WITH AI OCR RESULT */}
        {step === "review" && selectedFleet && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  Revisão de Registro
                </span>
                <h3 className="text-base font-bold text-slate-100">{selectedFleet.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setStep("photo")}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Refazer foto</span>
              </button>
            </div>

            {/* Photo preview */}
            {photoBase64 && (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black aspect-video">
                <img
                  src={photoBase64}
                  alt="Foto do Horômetro"
                  className="w-full h-full object-cover"
                />
                {isProcessingOcr && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-amber-400">
                    <Sparkles className="w-7 h-7 animate-spin" />
                    <span className="text-xs font-semibold text-slate-200">
                      IA Analisando Horômetro...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Horometro Extracted Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Leitura do Horômetro (Horas):</span>
                </label>
                {ocrConfidence >= 0.8 && !isProcessingOcr && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> IA Confiança {(ocrConfidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={horometroValue}
                  onChange={(e) => setHorometroValue(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-amber-500/50 focus:border-amber-400 rounded-xl py-3 px-4 text-2xl font-mono font-bold text-amber-300 focus:outline-none tracking-wider text-center"
                />
                <span className="absolute right-4 top-4 text-xs font-bold text-slate-500">
                  HORAS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Confira o número na imagem. Se necessário, corrija os dígitos manualmente.
              </p>
            </div>

            {/* Obra selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Obra / Localização da Máquina:</span>
              </label>
              <input
                type="text"
                value={selectedObra}
                onChange={(e) => setSelectedObra(e.target.value)}
                placeholder="Ex: CAMPO_LCO_05"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="button"
              disabled={isSubmitting || !horometroValue || isProcessingOcr}
              onClick={handleSubmitLog}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Confirmar e Registrar</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === "success" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Horômetro Registrado!</h2>
              <p className="text-xs text-slate-400">
                Os dados e a foto da <strong className="text-amber-400">{selectedFleet?.label}</strong> foram salvos e integrados ao sistema TRANSJAP.
              </p>
            </div>

            <button
              type="button"
              onClick={resetFlow}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm shadow-md transition-all"
            >
              Registrar Outra Máquina
            </button>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="p-3 text-center text-[10px] text-slate-600 border-t border-slate-900">
        TRANSJAP Controle &amp; Logística • Sistema de Frotas QR Code
      </footer>
    </div>
  );
}
