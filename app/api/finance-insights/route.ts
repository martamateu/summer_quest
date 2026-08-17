import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 30

const FinanceInsightsSchema = z.object({
  headline: z
    .string()
    .describe('1 frase resumen del mes, directa y personalizada. Ej: "Julio fue tu mejor mes de ahorro este año."'),
  savingsAssessment: z
    .enum(['excelente', 'bien', 'mejorable', 'critico'])
    .describe(
      '"excelente" si ahorro+inversión ≥25%, "bien" si ≥20%, "mejorable" si ≥10%, "critico" si <10%'
    ),
  highlights: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe('1-3 puntos positivos del mes. Ej: "Supermercado bajó un 12% vs mes anterior."'),
  warnings: z
    .array(z.string())
    .max(3)
    .describe('0-3 alertas o categorías que han subido significativamente vs mes anterior.'),
  recommendations: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe('1-3 recomendaciones concretas y accionables para el mes siguiente.'),
  yearTrend: z
    .string()
    .describe(
      '1-2 frases sobre la tendencia del año (si hay datos). Ej: "Llevas 4 meses con ahorro positivo. Tendencia al alza."'
    ),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      monthLabel,
      incomeBase,
      monthlySpendingTotal,
      monthlyFixedTotal,
      monthlyVariableTotal,
      monthlyInvestmentTotal,
      monthlySavingsLiquid,
      monthlySavingsTotal,
      prevMonthLabel,
      prevMonthSpendingTotal,
      prevMonthFixedTotal,
      prevMonthVariableTotal,
      prevMonthInvestmentTotal,
      prevMonthlySavingsLiquid,
      prevIncomeBase,
      categoryBreakdown,
      prevCategoryBreakdown,
      yearlyData,
    } = body

    const prompt = `Eres un asesor financiero personal experto y empático. Analiza los datos financieros de una persona y proporciona insights concretos, motivadores y accionables. Habla directamente a ella (tutéala). Responde en español.

## Mes analizado: ${monthLabel}
- Ingresos base: ${incomeBase}€
- Gastos reales (sin inversión): ${monthlySpendingTotal}€
  - Gastos fijos: ${monthlyFixedTotal}€
  - Gastos variables: ${monthlyVariableTotal}€
- Inversión: ${monthlyInvestmentTotal}€
- Ahorro líquido: ${monthlySavingsLiquid}€
- Ahorro total (líquido + inversión): ${monthlySavingsTotal}€

## Mes anterior: ${prevMonthLabel}
- Ingresos base: ${prevIncomeBase}€
- Gastos reales: ${prevMonthSpendingTotal}€
  - Fijos: ${prevMonthFixedTotal}€
  - Variables: ${prevMonthVariableTotal}€
- Inversión: ${prevMonthInvestmentTotal}€
- Ahorro líquido: ${prevMonthlySavingsLiquid}€

## Gastos por categoría — mes actual
${categoryBreakdown}

## Gastos por categoría — mes anterior
${prevCategoryBreakdown}

## Tendencia anual (últimos meses disponibles)
${yearlyData}

Genera:
1. Un titular motivador del mes
2. Una valoración del nivel de ahorro
3. Los puntos más positivos del mes (máx. 3)
4. Las alertas principales (categorías que subieron, gastos altos, etc.) (máx. 3)
5. Recomendaciones concretas para el mes siguiente (máx. 3)
6. Tendencia anual en 1-2 frases`

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: FinanceInsightsSchema,
      messages: [{ role: 'user', content: prompt }],
    })

    return Response.json(object)
  } catch (error) {
    console.error('finance-insights error:', error)
    return Response.json({ error: 'Error al generar insights financieros' }, { status: 500 })
  }
}
