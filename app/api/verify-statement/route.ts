import { streamObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60

const StatementItemSchema = z.object({
  date: z.string().describe('Fecha del movimiento en formato YYYY-MM-DD'),
  description: z.string().describe('Descripcion del movimiento tal como aparece en el extracto'),
  amount: z.number().describe('Importe en euros, siempre positivo'),
  isIncome: z.boolean().describe('true si es un ingreso/abono, false si es un gasto/cargo/adeudo'),
})

const StatementSchema = z.object({
  items: z.array(StatementItemSchema).describe('Todos los movimientos del extracto, ordenados por fecha'),
  statementMonth: z.string().optional().describe('Mes del extracto en formato YYYY-MM, si es identificable'),
  sourceType: z.enum(['bank', 'meal_card', 'unknown']).describe('Tipo de extracto: banco, tarjeta comedor, o desconocido'),
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const sourceHint = formData.get('sourceHint') as string | null

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'application/pdf'

    const sourceContext = sourceHint === 'meal_card'
      ? 'Es un extracto de tarjeta comedor (Cobee, Edenred, ticket restaurant). Cada cargo es un uso de la tarjeta.'
      : sourceHint === 'bank'
      ? 'Es un extracto bancario con cargos, abonos, transferencias y domiciliaciones.'
      : 'Puede ser un extracto bancario o de tarjeta de beneficios.'

    const result = streamObject({
      model: google('gemini-2.5-flash'),
      schema: StatementSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: base64,
              mediaType: mimeType,
            },
            {
              type: 'text',
              text: `Extrae todos los movimientos de este extracto financiero. ${sourceContext}
- amount siempre positivo; isIncome=true si es abono/ingreso, false si es cargo/pago.
- Omite saldos, totales y subtotales.
- Fecha en YYYY-MM-DD (infiere el año del contexto si solo ves día/mes).
- description: texto original, conciso.`,
            },
          ],
        },
      ],
    })

    // Collect the full streamed object and return it as JSON.
    // Using toTextStreamResponse() keeps the connection alive during processing,
    // preventing the Vercel 60s idle timeout from triggering.
    return result.toTextStreamResponse()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[verify-statement] Error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
