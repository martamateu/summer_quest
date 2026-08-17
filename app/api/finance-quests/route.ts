import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 30

const QuestSchema = z.object({
  id: z.string().describe('ID único corto, ej: "reduce-ocio-15"'),
  title: z.string().describe('Título corto del reto, máx 40 chars. Ej: "Reduce ocio un 15%"'),
  description: z
    .string()
    .describe('Descripción accionable de 1-2 frases explicando qué hacer exactamente.'),
  category: z
    .enum(['ahorro', 'categoria', 'habito'])
    .describe('"ahorro" para retos de guardar dinero, "categoria" para reducir una categoría, "habito" para hábitos financieros'),
  targetAmount: z
    .number()
    .optional()
    .describe('Cantidad objetivo en euros si aplica (ej: 50 para "ahorra 50€ esta semana")'),
  difficulty: z
    .enum(['facil', 'medio', 'dificil'])
    .describe('"facil" = pequeño esfuerzo, "medio" = requiere planificación, "dificil" = cambio significativo'),
  icon: z.string().describe('Emoji representativo del reto'),
})

const FinanceQuestsSchema = z.object({
  quests: z
    .array(QuestSchema)
    .min(3)
    .max(6)
    .describe('Entre 3 y 6 retos financieros personalizados para este mes.'),
  motivationalNote: z
    .string()
    .describe('1 frase motivadora y personalizada para empezar el mes con energía.'),
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
      prevMonthSpendingTotal,
      prevMonthlySavingsLiquid,
      prevIncomeBase,
      categoryBreakdown,
      prevCategoryBreakdown,
    } = body

    const savingsRate = incomeBase > 0 ? Math.round((monthlySavingsLiquid / incomeBase) * 100) : 0
    const prevSavingsRate =
      prevIncomeBase > 0 ? Math.round((prevMonthlySavingsLiquid / prevIncomeBase) * 100) : 0

    const prompt = `Eres un coach financiero personal. Genera retos financieros personalizados y alcanzables para el próximo mes basándote en los datos reales de la persona. Habla directamente a ella (tutéala). Sé específica y concreta con las cifras. Responde en español.

## Contexto del mes actual: ${monthLabel}
- Ingresos base: ${incomeBase}€
- Gastos reales (sin inversión): ${monthlySpendingTotal}€
  - Fijos: ${monthlyFixedTotal}€
  - Variables: ${monthlyVariableTotal}€
- Inversión: ${monthlyInvestmentTotal}€
- Ahorro líquido: ${monthlySavingsLiquid}€ (${savingsRate}% de ingresos)

## Mes anterior
- Gastos reales: ${prevMonthSpendingTotal}€
- Ahorro líquido: ${prevMonthlySavingsLiquid}€ (${prevSavingsRate}%)

## Gastos por categoría — mes actual
${categoryBreakdown}

## Gastos por categoría — mes anterior
${prevCategoryBreakdown}

Genera entre 3 y 6 retos financieros para el próximo mes que:
1. Sean específicos y basados en los datos reales (usa cifras concretas)
2. Incluyan al menos 1 reto de ahorro (guardar X€)
3. Incluyan al menos 1 reto de reducción de categoría (la que más ha subido o más gasta)
4. Incluyan al menos 1 reto de hábito (ej: registrar todos los gastos a diario)
5. Sean realistas y motivadores, no imposibles
6. Varíen en dificultad (al menos 1 fácil, 1 medio, 1 difícil)`

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: FinanceQuestsSchema,
      messages: [{ role: 'user', content: prompt }],
    })

    return Response.json(object)
  } catch (error) {
    console.error('finance-quests error:', error)
    return Response.json({ error: 'Error al generar los quests' }, { status: 500 })
  }
}
