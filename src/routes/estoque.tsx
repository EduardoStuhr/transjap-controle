import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";

export const Route = createFileRoute("/estoque")({ component: Estoque });

const PARTS = [
  { name: "Filtro de óleo CAT", code: "FLT-CAT-320", qty: 24, min: 10, in: "10/05/2026", out: "12/05/2026" },
  { name: "Mangueira hidráulica 3/4\"", code: "HID-MNG-075", qty: 4, min: 8, in: "01/05/2026", out: "11/05/2026" },
  { name: "Pastilha de freio Volvo FH", code: "FRE-VOL-FH", qty: 18, min: 6, in: "08/05/2026", out: "—" },
  { name: "Correia dentada Komatsu", code: "COR-KOM-D61", qty: 2, min: 4, in: "20/04/2026", out: "09/05/2026" },
  { name: "Lâmpada farol LED 24V", code: "ELE-LED-24", qty: 36, min: 12, in: "05/05/2026", out: "07/05/2026" },
];

function Estoque() {
  return (
    <AppLayout title="Controle de Estoque">
      <p className="text-on-surface-variant -mt-4 mb-8 text-base">
        Estoque de peças do almoxarifado TransJap.
      </p>

      <div className="bg-surface-container border border-border-low overflow-hidden">
        <div className="p-6 border-b border-border-low flex justify-between bg-surface-low gap-2 flex-wrap">
          <h3 className="text-2xl font-semibold">Peças Cadastradas</h3>
          <button
            type="button"
            onClick={() => toast("Nova Peça", { description: "Abrindo cadastro de peça." })}
            className="bg-primary-container text-on-primary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:opacity-90 active:scale-95 transition"
          >
            <Icon name="add" className="text-base" /> Nova Peça
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-lowest border-b border-border-low">
              <tr>{["Nome da peça","Código","Quantidade","Estoque mínimo","Última entrada","Última saída"].map(h => (
                <th key={h} className="px-6 py-4 text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border-low">
              {PARTS.map((p) => {
                const low = p.qty < p.min;
                return (
                  <tr key={p.code} className="hover:bg-surface-high">
                    <td className="px-6 py-4 text-sm font-semibold">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant font-mono">{p.code}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${low ? "text-status-error" : "text-on-surface"}`}>{p.qty}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{p.min}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{p.in}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{p.out}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
