import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60 // allow up to 60s for OCR processing

const ExpenseItemSchema = z.object({
  description: z.string().describe('Breve descripcion del cargo o linea del ticket'),
  amount: z.number().describe('Cantidad en euros (siempre positivo)'),
  category: z.enum([
    'comida',
    'transporte',
    'ocio',
    'hogar',
    'salud',
    'ropa',
    'suscripciones',
    'hipoteca',
    'seguros',
    'viajes',
    'otros',
  ]).describe('Categoria del gasto o ingreso'),
  confidence: z.enum(['high', 'low']).describe('Nivel de confianza en la categoria asignada'),
  date: z.string().optional().describe('Fecha de este cargo en formato YYYY-MM-DD. Si cada linea tiene su propia fecha usala, sino usa la fecha general del ticket'),
  isIncome: z.boolean().describe('true si es un ingreso (nomina, transferencia recibida, devolucion, abono). false si es un gasto/cargo'),
})

const ReceiptSchema = z.object({
  items: z.array(ExpenseItemSchema).describe('Lista de todos los cargos/lineas del ticket o extracto, cada uno con su fecha si es visible'),
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const image = formData.get('image') as File
    
    if (!image) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    const bytes = await image.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = image.type || 'image/jpeg'

    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: ReceiptSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: `data:${mimeType};base64,${base64}`,
            },
            {
              type: 'text',
              text: `Analiza este ticket, recibo, extracto bancario o captura de pantalla y extrae TODOS los cargos y movimientos que veas. No solo el primero, TODOS.

              Si es un extracto bancario o listado de movimientos, cada movimiento es un item separado.
              Si es un ticket de supermercado, cada producto es un item.
              Si es un solo cargo, devuelve un solo item.

              IMPORTANTE: Distingue entre GASTOS e INGRESOS:
              - isIncome: true → nomina, transferencia recibida, devolucion, abono, ingreso
              - isIncome: false → cargo, pago, compra, domiciliacion, adeudo
              - Si en el extracto aparece con signo + o "abono" o "ingreso" → isIncome: true
              - El amount SIEMPRE debe ser positivo, usa isIncome para indicar la direccion

              Categorias disponibles:
              - comida: supermercado, restaurantes, cafeterias, delivery
              - transporte: gasolina, taxi, transporte publico, parking, peajes
              - ocio: cine, conciertos, videojuegos, streaming, bares, copas
              - hogar: luz, agua, gas, internet, alquiler, muebles
              - salud: farmacia, medico, gimnasio
              - ropa: tiendas de ropa, zapatos, accesorios
              - suscripciones: netflix, spotify, gimnasio mensual, apps
              - hipoteca: cuota hipotecaria, prestamo hipotecario, amortizacion hipoteca
              - seguros: seguro coche, seguro hogar, seguro vida, seguro medico, mutua
              - viajes: vuelos, hotel, alojamiento, booking, airbnb, tren AVE, excursiones
              - otros: nomina, transferencias, cualquier cosa que no encaje
              
              Si no estas seguro de la categoria, pon confidence: "low".
              Cada amount debe ser un numero decimal positivo en euros.
              
              IMPORTANTE sobre fechas:
              - Si cada cargo/movimiento tiene su propia fecha (ej: extracto bancario), pon la fecha de cada uno en su campo "date".
              - Si el ticket tiene una sola fecha global, pon esa misma fecha en todos los items.
              - Formato siempre YYYY-MM-DD.
              - Si no hay fecha visible, omite el campo date.`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('Error analyzing receipt:', error)
    return Response.json(
      { error: 'Failed to analyze receipt' },
      { status: 500 }
    )
  }
}
