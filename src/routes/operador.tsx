import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  QrCode,
  Camera,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  Upload,
  ArrowRight,
  Clock,
  ShieldCheck,
  Send,
  AlertCircle,
  Focus,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeFleetId, formatFleetCode } from "@/lib/operational-options";
import { processHorometroOCR } from "@/lib/api/horometro";
import {
  FIELD_OPERATOR_NAME,
  OperatorHorometroApiError,
  submitOperatorHorometro,
} from "@/lib/api/operator-horometro";
import { listEquipment } from "@/lib/api/equipment";
import { isNativeCapacitor } from "@/lib/capacitor-shell";

export const Route = createFileRoute("/operador")({
  component: OperadorMobilePage,
});

// Fixed framing reticle coordinates for automatic visor region extraction
const AUTOMATIC_VISOR_FRAME = { x: 10, y: 25, width: 80, height: 45 };
const MAX_UPLOAD_PHOTO_DATA_URL_LENGTH = 1_500_000;

type SelectedFleet = {
  id: string;
  label: string;
  model: string;
  location?: string;
  hours: number;
};

type OperatorEquipment = {
  id: string;
  model: string;
  location: string;
  hours: number;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type PhotoQualityResult = {
  isGood: boolean;
  isDark: boolean;
  isTooBright: boolean;
  isBlurred: boolean;
  message?: string;
};

function getBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
}

function extractFleetCode(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segments.at(-1) || "");
  } catch {
    const withoutQuery = trimmed.split(/[?#]/, 1)[0];
    const segments = withoutQuery.split("/").filter(Boolean);
    return decodeURIComponent(segments.at(-1) || withoutQuery);
  }
}

function normalizeOperatorFleetId(rawText: string): string {
  const candidate = extractFleetCode(rawText).trim().toUpperCase();
  const withoutPrefix = candidate.replace(/^(?:FROTA|FR)[-\s]*/, "");

  if (/^\d+$/.test(withoutPrefix)) {
    const withoutLeadingZeros = withoutPrefix.replace(/^0+(?=\d)/, "");
    return normalizeFleetId(withoutLeadingZeros);
  }

  return normalizeFleetId(candidate);
}

function fleetNumericKey(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function scannerErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String(error.code);
}

// Client-side photo quality analysis using HTML5 Canvas (Luminance & Gradient Blur)
function analyzeImageQuality(imgElement: HTMLImageElement): PhotoQualityResult {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { isGood: true, isDark: false, isTooBright: false, isBlurred: false };

    const width = Math.min(imgElement.naturalWidth || 400, 400);
    const height = Math.min(imgElement.naturalHeight || 300, 300);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(imgElement, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let totalLuminance = 0;
    const pixelCount = data.length / 4;
    const grays = new Float32Array(pixelCount);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;
      grays[i / 4] = lum;
    }

    const avgLuminance = totalLuminance / pixelCount;
    const isDark = avgLuminance < 45;
    const isTooBright = avgLuminance > 225;

    let gradientSum = 0;
    let sampleCount = 0;
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const idx = y * width + x;
        const diffX = Math.abs(grays[idx] - grays[idx + 1]);
        const diffY = Math.abs(grays[idx] - grays[idx + width]);
        gradientSum += diffX + diffY;
        sampleCount++;
      }
    }

    const avgGradient = sampleCount > 0 ? gradientSum / sampleCount : 100;
    const isBlurred = avgGradient < 5.5;

    if (isDark) {
      return {
        isGood: false,
        isDark: true,
        isTooBright: false,
        isBlurred,
        message: "Foto muito escura. Ilumine o visor do horômetro e enquadre novamente.",
      };
    }
    if (isTooBright) {
      return {
        isGood: false,
        isDark: false,
        isTooBright: true,
        isBlurred,
        message: "Foto muito clara/estourada. Evite reflexos de luz diretos no visor.",
      };
    }
    if (isBlurred) {
      return {
        isGood: false,
        isDark: false,
        isTooBright: false,
        isBlurred: true,
        message: "Foto desfocada. Enquadre novamente o visor e firme a câmera.",
      };
    }

    return { isGood: true, isDark: false, isTooBright: false, isBlurred: false };
  } catch {
    return { isGood: true, isDark: false, isTooBright: false, isBlurred: false };
  }
}

// Invisible automatic crop of the framing reticle region
function autoCropVisorRegion(
  imgElement: HTMLImageElement,
  frame = AUTOMATIC_VISOR_FRAME,
): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return imgElement.src;

    const nw = imgElement.naturalWidth || imgElement.width || 800;
    const nh = imgElement.naturalHeight || imgElement.height || 600;

    const cropX = Math.round((frame.x / 100) * nw);
    const cropY = Math.round((frame.y / 100) * nh);
    const cropW = Math.round((frame.width / 100) * nw);
    const cropH = Math.round((frame.height / 100) * nh);

    const destW = Math.max(300, Math.min(800, cropW));
    const destH = Math.max(150, Math.min(400, cropH));

    canvas.width = destW;
    canvas.height = destH;

    ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, destW, destH);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return imgElement.src;
  }
}

function prepareOperatorPhoto(imgElement: HTMLImageElement): string {
  const sourceWidth = imgElement.naturalWidth || imgElement.width || 1600;
  const sourceHeight = imgElement.naturalHeight || imgElement.height || 1200;
  let maxDimension = 1600;
  let quality = 0.82;
  let result = imgElement.src;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return result;

    context.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= MAX_UPLOAD_PHOTO_DATA_URL_LENGTH) return result;

    maxDimension = Math.max(640, Math.round(maxDimension * 0.8));
    quality = Math.max(0.58, quality - 0.06);
  }

  return result;
}

function OperadorMobilePage() {
  const [step, setStep] = useState<"fleet" | "photo" | "review">("fleet");
  const [fleetInput, setFleetInput] = useState("");
  const [selectedFleet, setSelectedFleet] = useState<SelectedFleet | null>(null);

  // Photos
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [croppedPhotoBase64, setCroppedPhotoBase64] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);

  // OCR and Form State
  const [horometroValue, setHorometroValue] = useState<string>("");
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number>(1.0);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [ocrErrorMsg, setOcrErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scanner state
  const [qrScanningActive, setQrScanningActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrFrameRef = useRef<number | null>(null);
  const qrSessionRef = useRef(0);
  const mountedRef = useRef(true);
  const equipmentsRef = useRef<OperatorEquipment[]>([]);
  const equipmentsLoadRef = useRef<Promise<OperatorEquipment[]> | null>(null);
  const native = isNativeCapacitor();

  const releaseWebQrCamera = useCallback(() => {
    qrSessionRef.current += 1;
    if (qrFrameRef.current !== null) {
      window.cancelAnimationFrame(qrFrameRef.current);
      qrFrameRef.current = null;
    }
    qrStreamRef.current?.getTracks().forEach((track) => track.stop());
    qrStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopQrCamera = useCallback(() => {
    releaseWebQrCamera();
    if (mountedRef.current) {
      setQrScanningActive(false);
    }
  }, [releaseWebQrCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const loadPromise = listEquipment()
      .then((data) => {
        const equipments: OperatorEquipment[] = Array.isArray(data)
          ? data.map((equipment) => ({
              id: equipment.id,
              model: equipment.model,
              location: equipment.location,
              hours: equipment.hours ?? 0,
            }))
          : [];
        equipmentsRef.current = equipments;
        return equipments;
      })
      .catch((error) => {
        console.error("Erro ao carregar equipamentos:", error);
        return [] as OperatorEquipment[];
      });
    equipmentsLoadRef.current = loadPromise;

    return () => {
      mountedRef.current = false;
      releaseWebQrCamera();
    };
  }, [releaseWebQrCamera]);

  const resolveAndSelectFleet = useCallback(
    async (rawText: string) => {
      stopQrCamera();
      const normalizedId = normalizeOperatorFleetId(rawText);
      if (!normalizedId) {
        toast.error("QR Code ou número de frota inválido.");
        return;
      }

      let equipments = equipmentsRef.current;
      if (equipments.length === 0 && equipmentsLoadRef.current) {
        equipments = await equipmentsLoadRef.current;
      }
      if (!mountedRef.current) return;

      const numericKey = fleetNumericKey(normalizedId);
      const match = equipments.find(
        (equipment) =>
          normalizeFleetId(equipment.id) === normalizedId ||
          (numericKey !== "" && fleetNumericKey(equipment.id) === numericKey),
      );
      const fleetId = match ? normalizeFleetId(match.id) : normalizedId;
      const fleetLabel = formatFleetCode(fleetId) || `Frota ${numericKey || rawText}`;

      setSelectedFleet({
        id: fleetId,
        label: fleetLabel,
        model: match?.model || `Equipamento ${fleetLabel}`,
        location: match?.location?.trim() || undefined,
        hours: match?.hours ?? 0,
      });
      setStep("photo");
      toast.success(`${fleetLabel} selecionada!`);
    },
    [stopQrCamera],
  );

  useEffect(() => {
    if (!qrScanningActive || native) return;
    const BarcodeDetector = getBarcodeDetector();
    if (!BarcodeDetector) return;

    let cancelled = false;
    const session = qrSessionRef.current + 1;
    qrSessionRef.current = session;

    const startWebScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || qrSessionRef.current !== session) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        qrStreamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Preview da câmera indisponível.");
        video.srcObject = stream;
        await video.play();

        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        let lastDetection = 0;
        const scanFrame = async (timestamp: number) => {
          if (cancelled || qrSessionRef.current !== session) return;
          if (
            timestamp - lastDetection >= 250 &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            lastDetection = timestamp;
            const codes = await detector.detect(video).catch(() => []);
            if (cancelled || qrSessionRef.current !== session) return;
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              await resolveAndSelectFleet(value);
              return;
            }
          }
          qrFrameRef.current = window.requestAnimationFrame(scanFrame);
        };
        qrFrameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        releaseWebQrCamera();
        if (!cancelled && mountedRef.current) {
          console.warn("Câmera não permitida ou indisponível:", error);
          setQrScanningActive(false);
          toast.info("Digite o número da frota manualmente abaixo.");
        }
      }
    };

    void startWebScanner();
    return () => {
      cancelled = true;
      releaseWebQrCamera();
    };
  }, [native, qrScanningActive, releaseWebQrCamera, resolveAndSelectFleet]);

  const startQrCamera = async () => {
    if (!native) {
      if (!navigator.mediaDevices?.getUserMedia || !getBarcodeDetector()) {
        toast.info("Leitura por câmera indisponível neste navegador. Digite a frota abaixo.");
        return;
      }
      setQrScanningActive(true);
      return;
    }

    setQrScanningActive(true);
    try {
      const {
        CapacitorBarcodeScanner,
        CapacitorBarcodeScannerAndroidScanningLibrary,
        CapacitorBarcodeScannerCameraDirection,
        CapacitorBarcodeScannerScanOrientation,
        CapacitorBarcodeScannerTypeHint,
      } = await import("@capacitor/barcode-scanner");
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
        scanInstructions: "Aponte a câmera para o QR Code da máquina",
        scanButton: false,
        scanText: "Ler QR Code",
        cancelButtonAccessibilityLabel: "Cancelar leitura",
        torchButtonOnAccessibilityLabel: "Desligar lanterna",
        torchButtonOffAccessibilityLabel: "Ligar lanterna",
        android: {
          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING,
        },
      });
      if (mountedRef.current && result.ScanResult.trim()) {
        await resolveAndSelectFleet(result.ScanResult);
      }
    } catch (error) {
      const code = scannerErrorCode(error);
      if (code !== "OS-PLUG-BARC-0006" && !/cancel/i.test(String(error))) {
        console.warn("Não foi possível ler o QR Code:", error);
        toast.info(
          code === "OS-PLUG-BARC-0007"
            ? "Permita o uso da câmera ou digite a frota manualmente."
            : "Scanner indisponível. Digite a frota manualmente.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setQrScanningActive(false);
      }
    }
  };

  // Capture photo -> Auto Quality Check -> Invisible Automatic Visor Crop -> Direct to Review
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setQualityWarning(null);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Client-side photo quality pre-analysis
        const quality = analyzeImageQuality(img);
        if (!quality.isGood && quality.message) {
          setQualityWarning(quality.message);
          toast.warning(quality.message);
        } else {
          toast.success("Foto analisada: boa iluminação e nitidez!");
        }

        // Invisible automatic crop based on the camera framing reticle box
        const autoCropped = autoCropVisorRegion(img);
        const uploadPhoto = prepareOperatorPhoto(img);
        setPhotoBase64(uploadPhoto);
        setCroppedPhotoBase64(autoCropped);

        // Advance straight to review step (no manual crop screen!)
        setStep("review");

        // Immediately trigger Gemini Vision AI OCR on the auto-cropped visor
        runOcrProcess(autoCropped, uploadPhoto);
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  // Process image with Gemini Vision AI OCR (RESTRICTIVE)
  const runOcrProcess = async (visorBase64: string, fullBase64: string) => {
    setIsProcessingOcr(true);
    setOcrConfidence(1.0);
    setOcrRawText("");
    setOcrErrorMsg(null);

    // CRITICAL RULE: NEVER preset or invent random fallback values! Keep input empty if OCR fails!
    setHorometroValue("");

    try {
      const res = await processHorometroOCR({
        data: {
          imageBase64: visorBase64,
          fullImageBase64: fullBase64,
        },
      });

      if (res.success && res.horometroValue !== undefined && res.legivel !== false) {
        setHorometroValue(res.horometroValue.toString());
        setOcrConfidence(res.confidence);
        setOcrRawText(res.rawText || "");
        toast.success(`Horômetro lido com sucesso: ${res.horometroValue} h`);
      } else {
        // Log technical error details for developers/admins in console only
        console.error("Erro técnico no OCR Gemini:", res.error || res.motivo_duvida);

        // Operator user-facing message: friendly, clear, non-technical
        setHorometroValue("");
        setOcrConfidence(0);
        setOcrErrorMsg("Não foi possível identificar o horômetro automaticamente. Digite o valor mostrado no visor.");
        toast.warning("Não foi possível identificar o horômetro automaticamente. Digite o valor mostrado no visor.");
      }
    } catch (err) {
      console.error("Falha na chamada OCR:", err);
      setHorometroValue("");
      setOcrConfidence(0);
      setOcrErrorMsg("Não foi possível identificar o horômetro automaticamente. Digite o valor mostrado no visor.");
      toast.warning("Não foi possível identificar o horômetro automaticamente. Digite o valor mostrado no visor.");
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Submit horometro log with Fleet History Validation
  const handleSubmitLog = async () => {
    if (!selectedFleet) return;
    if (!photoBase64) {
      toast.error("Tire a foto do horometro antes de confirmar.");
      return;
    }
    const val = parseFloat(horometroValue);
    if (isNaN(val) || val <= 0) {
      toast.error("Informe um valor numérico válido de horômetro!");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitOperatorHorometro({
        fleet: selectedFleet.id,
        horometroValue: val,
        photoUrl: photoBase64,
        ocrConfidence,
        rawOcrText: ocrRawText,
        operatorName: FIELD_OPERATOR_NAME,
      });

      resetFlow();
      toast.success("Horômetro registrado. Pronto para a próxima máquina.");
    } catch (error) {
      if (error instanceof OperatorHorometroApiError) {
        console.error("Falha técnica ao registrar horômetro do operador", {
          kind: error.kind,
          code: error.code,
          status: error.status,
        });
      } else {
        console.error("Falha técnica inesperada ao registrar horômetro do operador", error);
      }
      toast.error("Não foi possível registrar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep("fleet");
    setFleetInput("");
    setSelectedFleet(null);
    setPhotoBase64(null);
    setCroppedPhotoBase64(null);
    setHorometroValue("");
    setOcrConfidence(1.0);
    setOcrRawText("");
    setQualityWarning(null);
    setOcrErrorMsg(null);
    setIsProcessingOcr(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    stopQrCamera();
  };

  // Fleet History Validation Checks
  const parsedVal = parseFloat(horometroValue);
  const prevFleetHours = selectedFleet?.hours || 0;
  const isValueLowerThanHistory =
    !isNaN(parsedVal) && prevFleetHours > 0 && parsedVal < prevFleetHours;
  const isValueJumpHigh =
    !isNaN(parsedVal) && prevFleetHours > 0 && parsedVal > prevFleetHours + 200;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center shadow-md">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg font-black tracking-wider text-xs">
            TRANSJAP
          </div>
          <span className="font-semibold text-sm text-slate-200">Operador Mobile</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center">
        {/* Step Progress Indicator (Simplified: Frota -> Foto -> Confirmação) */}
        <div className="mb-6 flex items-center justify-between px-4">
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
          <div className="h-[1px] flex-1 bg-slate-800 mx-3" />
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
          <div className="h-[1px] flex-1 bg-slate-800 mx-3" />
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              step === "review"
                ? "text-amber-400 font-bold"
                : "text-slate-400"
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
            {qrScanningActive && !native ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square border-2 border-amber-500/50 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
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
                disabled={qrScanningActive}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <QrCode className="w-5 h-5" />
                <span>{qrScanningActive ? "Scanner ativo..." : "Escanear QR Code da Frota"}</span>
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
                if (fleetInput.trim()) void resolveAndSelectFleet(fleetInput);
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
          </div>
        )}

        {/* STEP 2: TAKE HOROMETRO PHOTO WITH CAMERA FRAMING RETICLE & CLIENT-SIDE QUALITY CHECK */}
        {step === "photo" && selectedFleet && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Fleet details card */}
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                  Máquina Selecionada
                </span>
                <h3 className="text-base font-bold text-slate-100">{selectedFleet.label}</h3>
                <p className="text-xs text-slate-400">
                  {selectedFleet.model}{" "}
                  {selectedFleet.hours > 0 ? `• ${selectedFleet.hours}h acumuladas` : ""}
                </p>
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
              <h2 className="text-lg font-bold text-slate-100">Foto do Visor do Horômetro</h2>
              <p className="text-xs text-slate-400">
                Enquadre EXCLUSIVAMENTE o visor do horômetro dentro da moldura abaixo.
              </p>
            </div>

            {/* Visual Camera Framing Reticle Guide */}
            <div className="relative aspect-video rounded-xl bg-slate-950 border-2 border-dashed border-amber-500/50 p-2 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-4 border-2 border-amber-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-2 shadow-lg">
                <div className="flex justify-between text-[10px] text-amber-400 font-mono">
                  <span>┌ MOLDURA</span>
                  <span>VISOR ┐</span>
                </div>
                <div className="text-center">
                  <span className="bg-slate-900/90 text-amber-300 font-semibold px-2.5 py-1 rounded text-[11px] border border-amber-500/40 shadow">
                    Centralize o visor com os dígitos aqui
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-amber-400 font-mono">
                  <span>└ HORÔMETRO</span>
                  <span>DIGITAL ┘</span>
                </div>
              </div>
              <Focus className="w-10 h-10 text-amber-500/40 animate-pulse" />
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
                <span>Tirar Foto do Visor</span>
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
                O sistema analisará brilho e nitidez e processará os dígitos do visor automaticamente.
              </span>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & CONFIRM (AI OCR RESULT + MANUAL EDIT + FLEET HISTORY VALIDATION) */}
        {step === "review" && selectedFleet && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                  Revisão de Leitura
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

            {/* Quality Warning Alert (Client-side analysis) */}
            {qualityWarning && (
              <div className="bg-amber-500/15 border border-amber-500/40 p-3 rounded-xl text-amber-300 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Alerta de Qualidade da Foto:</strong>
                  <span>{qualityWarning}</span>
                </div>
              </div>
            )}

            {/* Photo preview (Original + Auto Visor Crop) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video">
                <img
                  src={photoBase64 || ""}
                  alt="Foto Completa Auditoria"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 bg-slate-950/80 text-[9px] px-1.5 py-0.5 rounded text-slate-400 font-mono">
                  Audit (Original)
                </span>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-amber-500/40 bg-black aspect-video">
                <img
                  src={croppedPhotoBase64 || photoBase64 || ""}
                  alt="Visor Processado IA"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 bg-amber-950/90 text-[9px] px-1.5 py-0.5 rounded text-amber-300 font-mono border border-amber-500/30">
                  Visor Moldura
                </span>
              </div>
            </div>

            {/* AI Loading State */}
            {isProcessingOcr && (
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 flex items-center justify-center gap-3 text-amber-400">
                <Sparkles className="w-6 h-6 animate-spin" />
                <span className="text-xs font-semibold text-slate-200">
                  Gemini Vision OCR Analisando Visor...
                </span>
              </div>
            )}

            {/* OCR Error / Non-legible / Missing Key Alert (Non-technical) */}
            {ocrErrorMsg && !isProcessingOcr && (
              <div className="bg-amber-500/15 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <span className="font-semibold block">{ocrErrorMsg}</span>
                </div>
              </div>
            )}

            {/* Fleet History Validation Warnings */}
            {isValueLowerThanHistory && (
              <div className="bg-red-500/20 border border-red-500/40 p-3 rounded-xl text-red-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div>
                  <strong className="block font-semibold">⚠️ Alerta de Inconsistência de Histórico:</strong>
                  <span>
                    O horômetro informado ({parsedVal} h) é MENOR que o valor acumulado registrado da frota ({prevFleetHours} h). O registro ficará pendente de revisão.
                  </span>
                </div>
              </div>
            )}

            {isValueJumpHigh && (
              <div className="bg-amber-500/20 border border-amber-500/40 p-3 rounded-xl text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="block font-semibold">⚠️ Alerta de Salto Elevado de Horas:</strong>
                  <span>
                    Aumento significativo de +{(parsedVal - prevFleetHours).toFixed(1)} h em relação à leitura anterior ({prevFleetHours} h). O registro será marcado para revisão.
                  </span>
                </div>
              </div>
            )}

            {/* Horometro Value Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Leitura do Horômetro (Horas Acumuladas):</span>
                </label>
                {ocrConfidence >= 0.75 && !isProcessingOcr && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> IA Confiança{" "}
                    {(ocrConfidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  placeholder="0.0 (Digite o horômetro)"
                  value={horometroValue}
                  onChange={(e) => setHorometroValue(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-amber-500/50 focus:border-amber-400 rounded-xl py-3 px-4 text-2xl font-mono font-bold text-amber-300 focus:outline-none tracking-wider text-center"
                />
                <span className="absolute right-4 top-4 text-xs font-bold text-slate-500">
                  HORAS
                </span>
              </div>

              <p className="text-[11px] text-slate-400 text-center">
                {!horometroValue
                  ? "Digite os números visíveis no visor do horômetro antes de confirmar."
                  : "Confira o número e corrija se necessário antes de enviar."}
              </p>
            </div>

            <button
              type="button"
              disabled={isSubmitting || !horometroValue || isProcessingOcr}
              onClick={handleSubmitLog}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <span>Salvando no Sistema...</span>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Confirmar e Registrar Horômetro</span>
                </>
              )}
            </button>
          </div>
        )}

      </main>

      {/* Footer Info */}
      <footer className="p-3 text-center text-[10px] text-slate-600 border-t border-slate-900">
        TRANSJAP Controle &amp; Logística • Visão Computacional Gemini AI
      </footer>
    </div>
  );
}
