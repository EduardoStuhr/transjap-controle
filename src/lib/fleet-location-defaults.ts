export type FleetLocationSeedRow = {
  id: string;
  model: string;
  location: string;
};

export const AVAILABLE_FLEET_LOCATIONS = [
  "Almoxarifado",
  "CAMPO LOG 5",
  "RDG - Contorno",
  "Ulihorte",
  "RDG - Viana",
] as const;

export const FLEET_LOCATION_SEED_ROWS: readonly FleetLocationSeedRow[] = [
  { id: "FR-070", model: "Moto Niveladora - 120H", location: "CAMPO LOG 5" },
  { id: "FR-074", model: "Escavadeira Hidraulica - 312 DL", location: "CAMPO LOG 5" },
  { id: "FR-084", model: "Retro-Escavadeira - 416-E 4x4", location: "CAMPO LOG 5" },
  { id: "FR-088", model: "Moto Niveladora - 120K", location: "CAMPO LOG 5" },
  { id: "FR-124", model: "Trator Pneus - A950 4x4", location: "CAMPO LOG 5" },
  { id: "FR-128", model: "Trator de esteiras - D6N", location: "CAMPO LOG 5" },
  { id: "FR-142", model: "Volvo VM 330", location: "CAMPO LOG 5" },
  { id: "FR-156", model: "Mercedes Benz AXOR", location: "CAMPO LOG 5" },
  { id: "FR-164", model: "Hillux CD 4X4 STD", location: "CAMPO LOG 5" },
  { id: "FR-168", model: "Gerador", location: "CAMPO LOG 5" },
  { id: "FR-192", model: "Caminhao Comboio", location: "CAMPO LOG 5" },
  { id: "FR-194", model: "Escavadeira Hidraulica - 336 DL", location: "CAMPO LOG 5" },
  { id: "FR-200", model: "Mercedes Benz AXOR 2644", location: "CAMPO LOG 5" },
  { id: "FR-204", model: "Micro Onibus", location: "CAMPO LOG 5" },
  { id: "FR-212", model: "Saveiro", location: "CAMPO LOG 5" },
  { id: "FR-218", model: "Prisma", location: "CAMPO LOG 5" },
  { id: "FR-232", model: "Escavadeira Hidraulica - 336", location: "CAMPO LOG 5" },
  { id: "FR-244", model: "Escavadeira Hidraulica - 345 GC", location: "CAMPO LOG 5" },
  { id: "FR-246", model: "Rolo Compactador Muller - TI 18", location: "CAMPO LOG 5" },
  { id: "FR-248", model: "Saveiro 1.6", location: "CAMPO LOG 5" },
  { id: "FR-250", model: "Rolo Compactador Hamm", location: "CAMPO LOG 5" },
  { id: "FR-262", model: "Caminhao Comboio", location: "CAMPO LOG 5" },
  { id: "FR-264", model: "Motoniveladora New Holland", location: "CAMPO LOG 5" },
  { id: "FR-266", model: "Caminhao pipa", location: "CAMPO LOG 5" },
  { id: "FR-274", model: "Rolo Compactador Hamm", location: "CAMPO LOG 5" },
  { id: "FR-278", model: "Moto Bomba", location: "CAMPO LOG 5" },
  { id: "FR-280", model: "Kia Bongo", location: "CAMPO LOG 5" },
  { id: "FR-282", model: "Trator Valtra BM135", location: "CAMPO LOG 5" },
  { id: "FR-292", model: "Fiat Fiorino Endurance", location: "CAMPO LOG 5" },
  { id: "FR-294", model: "CHEV ONIX", location: "CAMPO LOG 5" },
  { id: "FR-296", model: "Moto Bomba", location: "CAMPO LOG 5" },
  { id: "FR-118", model: "Mini-escavadeira - 302.5", location: "RDG - Contorno" },
  { id: "FR-214", model: "Volvo VM 330", location: "Ulihorte" },
  { id: "FR-230", model: "Escavadeira Hidraulica - 320", location: "Ulihorte" },
  { id: "FR-236", model: "Escavadeira Hidraulica - 130G", location: "Ulihorte" },
  { id: "FR-240", model: "Motoniveladora 140GC", location: "Ulihorte" },
  { id: "FR-242", model: "Motoniveladora 140GC", location: "Ulihorte" },
  { id: "FR-256", model: "Rolo Dynapac", location: "Ulihorte" },
  { id: "FR-284", model: "Trator Valtra BM135", location: "Ulihorte" },
  { id: "FR-068", model: "Pipa ford", location: "RDG - Viana" },
  { id: "FR-090", model: "Rolo Compactador", location: "RDG - Viana" },
  { id: "FR-182", model: "Volvo VM 330", location: "RDG - Viana" },
  { id: "FR-228", model: "Escavadeira Hidraulica - 320", location: "RDG - Viana" },
  { id: "FR-238", model: "Escavadeira Hidraulica - 130G", location: "RDG - Viana" },
  { id: "FR-254", model: "Rolo Dynapac", location: "RDG - Viana" },
  { id: "FR-258", model: "Trator John Deere", location: "RDG - Viana" },
  { id: "FR-260", model: "Gol branco", location: "RDG - Viana" },
  { id: "FR-268", model: "Escavadeira volvo", location: "RDG - Viana" },
  { id: "FR-270", model: "Moto Bomba", location: "RDG - Viana" },
  { id: "FR-290", model: "Moto Niveladora 140", location: "RDG - Viana" },
];

export const INITIAL_FLEET_LOCATIONS: Record<string, string> = Object.fromEntries(
  FLEET_LOCATION_SEED_ROWS.map((row) => [row.id, row.location]),
);

export const INITIAL_FLEET_MODELS: Record<string, string> = Object.fromEntries(
  FLEET_LOCATION_SEED_ROWS.map((row) => [row.id, row.model]),
);

export const INITIAL_FLEET_LOCATION_OPTIONS = AVAILABLE_FLEET_LOCATIONS.slice().sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);
