import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import type { CycleData } from '@/lib/types'
import { computeAvgCycleLen, getAveragePeriodLength, predictNextPeriod } from '@/lib/cycle'

export const maxDuration = 30

const InsightsSchema = z.object({
  summary: z.string().describe('1-2 frases describiendo el patrón detectado en el historial'),
  cycleRegularity: z
    .enum(['regular', 'irregular', 'pocos_datos'])
    .describe('"regular" si la variación entre ciclos es ≤4 días; "irregular" si es mayor; "pocos_datos" si hay menos de 2 ciclos registrados'),
  insights: z
    .array(z.string())
    .max(3)
    .describe('2-3 sugerencias suaves y accionables según la fase/patrón del ciclo. Nunca consejos médicos.'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const cycle = body?.cycle as CycleData | undefined

    if (!cycle || !Array.isArray(cycle.periods)) {
      return Response.json({ error: 'Datos de ciclo no válidos' }, { status: 400 })
    }

    const periods = cycle.periods
    const n = periods.length

    // Con menos de 2 periodos respondemos sin llamar a la IA (sin datos útiles)
    if (n < 2) {
      return Response.json({
        summary: 'Aún no hay suficientes ciclos registrados para detectar patrones. Registra al menos 2 periodos para obtener insights personalizados.',
        cycleRegularity: 'pocos_datos',
        insights: [
          'Añade el inicio y fin de tus próximos periodos para que el análisis sea más preciso.',
          'Cuantos más ciclos registres, más útiles serán las predicciones.',
        ],
      } satisfies z.infer<typeof InsightsSchema>)
    }

    // Estadísticas previas calculadas para enriquecer el prompt
    const avgCycleLen = computeAvgCycleLen(periods)
    const avgPeriodLen = getAveragePeriodLength(periods)
    const nextPrediction = predictNextPeriod(cycle)

    const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
    const firstPeriod = sorted[0].start
    const lastPeriod = sorted[sorted.length - 1].start

    const prompt = `Eres un asistente de salud femenina. Analiza el historial de ciclos menstruales y proporciona información útil y empática.

IMPORTANTE: NO das consejos médicos. Siempre recomienda consultar a un profesional de la salud para cualquier preocupación médica.

Historial:
- Número de periodos registrados: ${n}
- Primer periodo registrado: ${firstPeriod}
- Último periodo registrado: ${lastPeriod}
- Duración media del ciclo: ${avgCycleLen !== undefined ? `${avgCycleLen} días` : 'no calculable aún'}
- Duración media de la regla: ${avgPeriodLen} días
- Próximo periodo predicho: ${nextPrediction ? `${nextPrediction.date} (confianza: ${nextPrediction.confidence})` : 'no calculable'}
- Periodos detallados: ${JSON.stringify(sorted.map(p => ({ start: p.start, end: p.end || 'en curso', symptoms: p.symptoms || [] })))}

Genera:
1. Un resumen breve (1-2 frases) del patrón del ciclo detectado.
2. La regularidad del ciclo: "regular" si la variación entre ciclos es ≤4 días, "irregular" si es mayor.
3. 2-3 insights accionables y suaves orientados al bienestar según el patrón (ej: energía por fase, autocuidado, nutrición general). Nunca diagnósticos ni consejos médicos específicos.

Responde en español.`

    const { object } = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: InsightsSchema,
      messages: [{ role: 'user', content: prompt }],
    })

    return Response.json(object)
  } catch (error) {
    console.error('cycle-insights error:', error)
    return Response.json({ error: 'Error al generar insights del ciclo' }, { status: 500 })
  }
}
