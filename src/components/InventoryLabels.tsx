import { useEffect, useState } from "react";
import * as QRCode from "qrcode";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import type { InventoryItem, StockLocation } from "@/lib/inventory-types";

type InventoryLabelsProps = {
  items: InventoryItem[];
  locations: StockLocation[];
};

export function InventoryLabels({ items, locations }: InventoryLabelsProps) {
  const labels = [
    ...locations.map((location) => ({
      id: location.id,
      title: location.name,
      subtitle: `${location.kind} · ${location.code}`,
      qrCode: location.qrCode,
      barcode: location.code,
    })),
    ...items.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: `${item.category} · ${item.internalCode}`,
      qrCode: item.qrCode,
      barcode: item.barcode || item.sku || item.internalCode,
    })),
  ];

  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4 shadow-industrial">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">
            Etiquetas imprimíveis
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Localizações e peças usam payloads QR padronizados para leitura posterior.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2">
          <Icon name="print" />
          Imprimir
        </Button>
      </div>

      {labels.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-3">
          {labels.map((label) => (
            <article
              key={label.id}
              className="border border-border-low rounded-lg p-4 bg-surface-highest print:bg-white print:text-black"
            >
              <div className="flex gap-4">
                <QrCodeImage value={label.qrCode} />
                <div className="min-w-0">
                  <h3 className="font-black text-sm leading-tight truncate">{label.title}</h3>
                  <p className="text-xs text-on-surface-variant print:text-neutral-700 mt-1">
                    {label.subtitle}
                  </p>
                  <p className="font-mono text-[10px] break-all mt-2">{label.qrCode}</p>
                </div>
              </div>
              <div className="mt-3 h-10 flex items-end gap-0.5 border-t border-border-low pt-2">
                {Array.from({ length: 36 }).map((_, index) => (
                  <span
                    key={index}
                    className="bg-on-surface print:bg-black"
                    style={{
                      width: index % 4 === 0 ? 3 : 1,
                      height: `${12 + ((label.barcode.charCodeAt(index % label.barcode.length) + index) % 24)}px`,
                    }}
                  />
                ))}
              </div>
              <p className="font-mono text-[10px] mt-1">{label.barcode}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-on-surface-variant">
          <Icon name="qr_code_2" className="text-5xl opacity-30 mb-2" />
          <p>Nenhuma etiqueta para imprimir ainda</p>
        </div>
      )}
    </section>
  );
}

function QrCodeImage({ value }: { value: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 192, errorCorrectionLevel: "M" })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [value]);

  return (
    <div className="h-24 w-24 border-2 border-on-surface/70 bg-white shrink-0">
      {src ? (
        <img src={src} alt={`QR ${value}`} className="h-full w-full object-contain" />
      ) : (
        <div className="h-full w-full grid place-items-center text-black text-[10px] font-mono p-2">
          QR
        </div>
      )}
    </div>
  );
}
