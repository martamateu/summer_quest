import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 120 // PDFs can take longer than receipts

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
    const sourceHint = formData.get('sourceHint') as string | null // 'bank' | 'meal_card'

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'application/pdf'

    const sourceContext = sourceHint === 'meal_card'
      ? 'Es un extracto de tarjeta de beneficios/comedor (ticket restaurant, Cobee, Edenred, etc.). Cada cargo es un uso de la tarjeta comedor.'
      : sourceHint === 'bank'
      ? 'Es un extracto bancario. Incluye cargos, abonos, transferencias, domiciliaciones, etc.'
      : 'Puede ser un extracto bancario o de tarjeta de beneficios.'

    const { object } = await generateObject({
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
              text: `Analiza este extracto de movimientos financieros y extrae TODOS los movimientos que aparecen.

${sourceContext}

REGLAS:
- Extrae TODOS los movimientos sin excepción, uno por uno.
- El campo "amount" SIEMPRE es positivo. Usa "isIncome" para indicar si es cargo o abono.
- isIncome: true → abono, ingreso, transferencia recibida, devolución, nómina, sueldo, +
- isIncome: false → cargo, pago, compra, domiciliación, adeudo, -
- Si hay saldo inicial/final, NO lo incluyas como movimiento.
- Si hay totales o subtotales, NO los incluyas como movimiento.
- Fecha: formato YYYY-MM-DD. Si solo ves día/mes, infiere el año del contexto del extracto.
- Descripcion: texto original del extracto, limpio y conciso.
- Identifica el tipo de extracto: "bank" para banco, "meal_card" para tarjeta comedor, "unknown" si no está claro.`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('[verify-statement] Error:', error)
    return Response.json({ error: 'Failed to analyze statement' }, { status: 500 })
  }
}
