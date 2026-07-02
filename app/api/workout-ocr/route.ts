import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60

const WorkoutSchema = z.object({
  activityName: z.string().describe('Nombre exacto de la actividad o clase tal como aparece en el screenshot (ej: "Yoga Flow", "Pilates Mat", "Boxing", "Natación", "WOD")'),
  activityType: z.enum(['flexibilidad', 'fuerza', 'cardio', 'natacion', 'otro'])
    .describe(`Clasifica la actividad:
      - flexibilidad: yoga (cualquier estilo), pilates, stretching, movilidad, flexibility, barre, yin yoga, hatha, vinyasa, kundalini, ashtanga, skill yoga
      - fuerza: crossfit, WOD, weights, musculación, boxing, kickboxing, functional, HIIT con pesas, powerlifting, muay thai
      - cardio: running, cycling, spinning, zumba, dance, aeróbic, HIIT cardio, jump rope
      - natacion: natación, aqua fitness, aqua gym, waterpolo, swim
      - otro: cualquier actividad que no encaje claramente en las anteriores`),
  studio: z.string().optional().describe('Nombre del estudio, gimnasio o app (ej: "Urban Sports Club", "Skill Yoga", "Aqua Sports Club"). Si no es visible, omitir.'),
  date: z.string().optional().describe('Fecha de la actividad en formato YYYY-MM-DD. Si aparece en el screenshot, extráela. Si no, omitir.'),
  durationMinutes: z.number().optional().describe('Duración en minutos si aparece en el screenshot. Si no, omitir.'),
  instructor: z.string().optional().describe('Nombre del instructor o profesor si aparece. Si no, omitir.'),
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
      schema: WorkoutSchema,
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
              text: `Analiza este screenshot de una app de deporte/fitness (Urban Sports Club, Skill Yoga, Aqua Sports Club u otra) y extrae la información del entreno o clase.

Instrucciones:
- Lee el nombre exacto de la actividad o clase que aparece en pantalla.
- Clasifica el tipo según las categorías definidas. Presta especial atención a:
  * TODO lo relacionado con yoga (cualquier estilo), pilates, stretching o movilidad → "flexibilidad"
  * Todo lo relacionado con pesas, crossfit, boxing, artes marciales → "fuerza"  
  * Cardio puro (correr, bici, spinning, zumba) → "cardio"
  * Natación o actividades acuáticas → "natacion"
- Extrae la fecha si aparece visible (formato YYYY-MM-DD).
- Extrae la duración en minutos si aparece.
- Identifica el estudio o app si es reconocible.
- Responde en español.`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('workout-ocr error:', error)
    return Response.json({ error: 'Error al analizar el entreno' }, { status: 500 })
  }
}
