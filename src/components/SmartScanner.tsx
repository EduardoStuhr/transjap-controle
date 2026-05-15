import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";

type SmartScannerProps = {
  active: boolean;
  continuous: boolean;
  onScan: (value: string) => void;
};

type BarcodeDetectorShape = {
  new (options?: { formats?: string[] }): {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
  };
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorShape;
  }
}

export function SmartScanner({ active, continuous, onScan }: SmartScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  const confirmScan = useCallback(
    (value: string) => {
      if (navigator.vibrate) navigator.vibrate(60);
      playBeep();
      onScan(value);
    },
    [onScan],
  );

  useEffect(() => {
    setCameraSupported(typeof window !== "undefined" && Boolean(window.BarcodeDetector));
  }, []);

  useEffect(() => {
    if (!active || !cameraEnabled || !cameraSupported) return;
    let cancelled = false;
    let frame = 0;
    let lastDetection = 0;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const detector = new window.BarcodeDetector!({
          formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          const currentTime = performance.now();
          if (currentTime - lastDetection > (continuous ? 900 : 1200)) {
            lastDetection = currentTime;
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes[0]?.rawValue;
              if (value) {
                confirmScan(value);
                if (!continuous) {
                  setCameraEnabled(false);
                  return;
                }
              }
            } catch {
              setCameraEnabled(false);
            }
          }
          frame = window.requestAnimationFrame(tick);
        };

        tick();
      } catch {
        toast.error("Câmera indisponível", {
          description: "Use a entrada manual ou um leitor Bluetooth/USB.",
        });
        setCameraEnabled(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, cameraEnabled, cameraSupported, confirmScan, continuous]);

  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualCode.trim()) return;
    confirmScan(manualCode);
    setManualCode("");
  };

  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4 shadow-industrial">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">
            Leitura inteligente
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            QR, código de barras, localização, gaveta, caixa ou entrada manual.
          </p>
        </div>
        <Button
          type="button"
          variant={cameraEnabled ? "default" : "outline"}
          onClick={() => setCameraEnabled((value) => !value)}
          disabled={!cameraSupported}
          className="gap-2"
        >
          <Icon name="qr_code_scanner" />
          Câmera
        </Button>
      </div>

      {cameraEnabled && (
        <div className="mb-4 overflow-hidden rounded-lg border border-border-low bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-56 w-full object-cover" />
        </div>
      )}

      <form onSubmit={submitManual} className="flex flex-col sm:flex-row gap-2">
        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="Leia ou digite QR, código, SKU, gaveta, caixa ou localização"
          className="flex-1 px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
        <Button type="submit" className="font-black gap-2">
          <Icon name="bolt" />
          Processar
        </Button>
      </form>

      {!cameraSupported && (
        <p className="text-[11px] text-on-surface-variant mt-3">
          Este navegador não expõe leitura por câmera nativa. Leitores USB/Bluetooth funcionam como
          teclado na entrada manual.
        </p>
      )}
    </section>
  );
}

function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch {
    return;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
