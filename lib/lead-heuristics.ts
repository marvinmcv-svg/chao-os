/**
 * Deterministic Go/No-Go scoring used when Claude is not configured.
 * Transparent, explainable rules so the firm still gets a consistent
 * first-pass qualification. Output shape matches `scoreLead()`.
 */
export interface HeuristicInput {
  estimatedValueUSD: number
  closeProbability: number
  projectType: string
  sourceType: string
  pipelineStage: string
  notes?: string | null
  /** Average studio utilisation 0-100+, used for the execution dimension. */
  studioUtilization?: number
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

export function heuristicLeadScore(l: HeuristicInput) {
  const v = l.estimatedValueUSD
  const financialScore = clamp(v >= 250_000 ? 85 : v >= 120_000 ? 75 : v >= 60_000 ? 62 : 45)
  const technicalScore = clamp(
    { RESIDENTIAL: 80, COMMERCIAL: 72, MIXED: 65, INSTITUTIONAL: 60, INDUSTRIAL: 58 }[l.projectType] ?? 65
  )
  const sourceBoost = { REFERRAL: 20, NETWORK: 12, DIRECT: 8, ONLINE: 0 }[l.sourceType] ?? 5
  const commercialScore = clamp(l.closeProbability * 0.6 + 25 + sourceBoost)
  const legalScore = clamp(l.projectType === 'INSTITUTIONAL' ? 55 : 72)
  const util = l.studioUtilization ?? 70
  const executionScore = clamp(util >= 100 ? 35 : util >= 85 ? 55 : util >= 60 ? 75 : 88)

  const overallScore = clamp(
    financialScore * 0.25 + technicalScore * 0.15 + commercialScore * 0.25 + legalScore * 0.1 + executionScore * 0.25
  )
  const recommendation: 'GO' | 'NO_GO' | 'REVIEW' = overallScore >= 70 ? 'GO' : overallScore < 50 ? 'NO_GO' : 'REVIEW'

  const keyStrengths: string[] = []
  const keyRisks: string[] = []
  if (financialScore >= 75) keyStrengths.push('Honorario estimado atractivo para el estudio')
  else keyRisks.push('Honorario bajo respecto al esfuerzo típico')
  if (sourceBoost >= 12) keyStrengths.push('Origen por recomendación o red: mayor tasa de cierre')
  if (executionScore >= 75) keyStrengths.push('El equipo tiene capacidad disponible')
  else keyRisks.push('Equipo con alta carga: riesgo de plazos')
  if (legalScore < 60) keyRisks.push('Proyecto institucional: permisos y contratación más complejos')

  return {
    financialScore,
    technicalScore,
    commercialScore,
    legalScore,
    executionScore,
    overallScore,
    recommendation,
    summary: `Puntaje heurístico (IA no configurada): ${overallScore}/100 → ${recommendation === 'GO' ? 'avanzar' : recommendation === 'NO_GO' ? 'no avanzar' : 'revisar'}. Basado en honorario, fuente, probabilidad, tipología y carga del estudio.`,
    keyStrengths: keyStrengths.slice(0, 3),
    keyRisks: keyRisks.slice(0, 3),
    nextSteps: recommendation === 'GO'
      ? ['Agendar reunión de alcance', 'Preparar propuesta de honorarios por fase']
      : recommendation === 'REVIEW'
        ? ['Validar presupuesto del cliente', 'Confirmar disponibilidad del equipo']
        : ['Declinar cortésmente o renegociar alcance'],
  }
}
