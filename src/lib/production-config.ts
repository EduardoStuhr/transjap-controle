export const PRODUCTION_CONFIG = {
  /** Capacidade orçada por viagem (m³ compactado) — vem do contrato base */
  CAPACIDADE_ORCADA_M3_VIAGEM: 9.40,

  /** Fator de empolamento padrão: m_compactado = m_solto × FATOR */
  FATOR_EMPOLAMENTO: 0.7,

  /** Preço unitário pago por m³ de transporte aos agregados (R$) */
  PRECO_POR_M3_TRANSPORTE: 1.65,
} as const;
