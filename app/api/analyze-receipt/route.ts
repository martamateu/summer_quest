import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const ExpenseItemSchema = z.object({
  description: z.string().describe('Breve descripcion del cargo o linea del ticket'),
  amount: z.number().describe('Cantidad en euros de este cargo'),
  category: z.enum([
    'comida',
    'transporte',
    'ocio',
    'hogar',
    'salud',
    'ropa',
    'suscripciones',
    'otros',
  ]).describe('Categoria del gasto'),
  confidence: z.enum(['high', 'low']).describe('Nivel de confianza en la categoria asignada'),
})

const ReceiptSchema = z.object({
  items: z.array(ExpenseItemSchema).describe('Lista de todos los cargos/lineas del ticket o extracto'),
  date: z.string().optional().describe('Fecha del ticket en formato YYYY-MM-DD si es visible, sino omitir'),
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
      model: google('gemini-2.5-flash'),
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
              text: `Analiza este ticket, recibo, extracto bancario o captura de pantalla y extrae TODOS los cargos/lineas de gasto que veas. No solo el primero, TODOS.

              Si es un extracto bancario o listado de movimientos, cada movimiento es un item separado.
              Si es un ticket de supermercado, cada producto es un item.
              Si es un solo cargo, devuelve un solo item.

              Categorias disponibles:
              - comida: supermercado, restaurantes, cafeterias, delivery
              - transporte: gasolina, taxi, transporte publico, parking, peajes
              - ocio: cine, conciertos, videojuegos, streaming, bares, copas
              - hogar: luz, agua, gas, internet, alquiler, muebles
              - salud: farmacia, medico, gimnasio
              - ropa: tiendas de ropa, zapatos, accesorios
              - suscripciones: netflix, spotify, gimnasio mensual, apps
              - otros: cualquier cosa que no encaje
              
              Si no estas seguro de la categoria, pon confidence: "low".
              Cada amount debe ser un numero decimal positivo en euros.
              Si ves una fecha en el ticket, incluyela en formato YYYY-MM-DD.`,
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
