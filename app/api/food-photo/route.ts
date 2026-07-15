import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60

const FoodPhotoSchema = z.object({
  foodName: z.string().describe('Nombre del plato o alimento que aparece en la foto (en español)'),
  estimatedKcal: z.number().describe('Calorías estimadas de lo que aparece en la foto'),
  estimatedProtein: z.number().describe('Proteína estimada en gramos'),
  estimatedCarbs: z.number().describe('Carbohidratos estimados en gramos'),
  estimatedFat: z.number().describe('Grasa estimada en gramos'),
  portionNotes: z.string().describe('Breve nota sobre la ración detectada (ej: "ración media", "plato grande", "snack pequeño")'),
  aiCoachFeedback: z.string().describe(
    'Feedback motivador y concreto (2-3 frases) de cómo encaja este alimento con los objetivos del día: ' +
    'si ayuda a llegar a los macros pendientes, si hay algo a ajustar, o si simplemente va bien. ' +
    'Sé directa, empática y práctica. Habla en español de España (tuteo).'
  ),
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const image = formData.get('image') as File

    // Context about remaining macros for the day
    const remainingKcal = Number(formData.get('remainingKcal') ?? 0)
    const remainingProtein = Number(formData.get('remainingProtein') ?? 0)
    const remainingCarbs = Number(formData.get('remainingCarbs') ?? 0)
    const remainingFat = Number(formData.get('remainingFat') ?? 0)
    const eatenKcal = Number(formData.get('eatenKcal') ?? 0)
    const targetKcal = Number(formData.get('targetKcal') ?? 0)
    const dayType = (formData.get('dayType') as string) ?? 'entreno'

    if (!image) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    const bytes = await image.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = image.type || 'image/jpeg'

    const contextText = targetKcal > 0
      ? `Contexto del día (${dayType === 'entreno' ? 'día de entreno' : 'día de descanso'}):
- Ya has comido: ${eatenKcal} kcal
- Objetivo diario: ${targetKcal} kcal
- Te quedan por comer hoy: ${remainingKcal} kcal, ${remainingProtein}g proteína, ${remainingCarbs}g carbos, ${remainingFat}g grasa`
      : ''

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: FoodPhotoSchema,
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
              text: `Analiza este alimento o plato de comida y estima sus macros nutricionales.

${contextText}

Instrucciones:
- Identifica el alimento o plato que aparece en la foto.
- Estima las calorías y macros (proteína, carbohidratos, grasa) para la ración visible.
- Ten en cuenta la ración aproximada que aparece en la imagen.
- Usa valores de referencia nutricionales estándar (por 100g ajustado a la ración).
- El feedback de la IA coach debe ser personalizado al contexto del día si se proporciona, o general si no hay contexto.
- Responde siempre en español de España.`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('food-photo error:', error)
    return Response.json({ error: 'Error al analizar la foto de comida' }, { status: 500 })
  }
}
