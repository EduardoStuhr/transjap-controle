import { parsePdeFile, type PdeColumnMapping, type PdeParseResult } from "@/lib/carcara-parser";

type Msg = {
  kind: "parse";
  file: File;
  mapping?: PdeColumnMapping;
  dateFrom?: string;
  dateTo?: string;
  requiredFleets?: Set<string>;
};
type Reply =
  | { kind: "result"; result: PdeParseResult }
  | { kind: "error"; message: string };

self.onmessage = async (e: MessageEvent<Msg>) => {
  try {
    const result = await parsePdeFile(e.data.file, e.data.mapping, {
      dateFrom: e.data.dateFrom,
      dateTo: e.data.dateTo,
      requiredFleets: e.data.requiredFleets,
    });
    (self as unknown as Worker).postMessage({ kind: "result", result } satisfies Reply);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      kind: "error",
      message: err instanceof Error ? err.message : "Erro desconhecido",
    } satisfies Reply);
  }
};
