import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const ExpenseSchema = z.object({
  description: z.string().describe('Breve descripcion del gasto'),
  amount: z.number().describe('Cantidad total en euros'),
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
      schema: ExpenseSchema,
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
              text: `Analiza este ticket o recibo y extrae la informacion del gasto.
              
              Categorias disponibles:
              - comida: supermercado, restaurantes, cafeterias
              - transporte: gasolina, taxi, transporte publico, parking
              - ocio: cine, conciertos, videojuegos, streaming
              - hogar: luz, agua, gas, internet, alquiler
              - salud: farmacia, medico, gimnasio
              - ropa: tiendas de ropa, zapatos
              - suscripciones: netflix, spotify, gimnasio mensual
              - otros: cualquier cosa que no encaje
              
              Si no estas seguro de la categoria, pon confidence: "low".
              El amount debe ser el total en euros (numero decimal).`,
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
