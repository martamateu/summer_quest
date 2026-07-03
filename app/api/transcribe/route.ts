import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60

const TranscriptSchema = z.object({
  text: z.string().describe('Transcripción literal y completa de lo que se dice en el audio, en español.'),
  title: z.string().describe('Título muy corto (2-5 palabras) que resume el contenido de la nota.'),
  area: z.enum(['salud', 'finanzas', 'carrera', 'hogar', 'personal', 'otros'])
    .describe('Área temática de la nota'),
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio') as File

    if (!audio) {
      return Response.json({ error: 'No audio provided' }, { status: 400 })
    }

    const bytes = await audio.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = audio.type || 'audio/webm'

    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: TranscriptSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: `data:${mimeType};base64,${base64}`,
              mediaType: mimeType,
            },
            {
              type: 'text',
              text: `Transcribe exactamente lo que se dice en este audio de voz en español.
Luego genera un título corto (2-5 palabras) y clasifica el área temática.
Responde en español.`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('transcribe error:', error)
    return Response.json({ error: 'Error al transcribir el audio' }, { status: 500 })
  }
}
