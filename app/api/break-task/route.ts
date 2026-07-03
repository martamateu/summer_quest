import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 30

const StepsSchema = z.object({
  firstAction: z.string().describe('La primera micro-acción de 2 minutos para empezar AHORA mismo, muy concreta y fácil'),
  steps: z.array(
    z.object({
      text: z.string().describe('Paso muy concreto y accionable, empieza por un verbo'),
      minutes: z.number().describe('Minutos estimados para este paso (entre 1 y 20)'),
    })
  ).min(2).max(7).describe('Lista ordenada de mini-pasos para completar la tarea'),
})

export async function POST(request: Request) {
  try {
    const { task } = await request.json()

    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return Response.json({ error: 'No task provided' }, { status: 400 })
    }

    const { object } = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: StepsSchema,
      messages: [
        {
          role: 'user',
          content: `Ayuda a alguien que se siente bloqueado o agobiado con esta tarea a empezar. Divídela en mini-pasos muy pequeños y concretos para vencer la parálisis.

Tarea: "${task.trim()}"

Reglas:
- "firstAction": una micro-acción de máximo 2 minutos para arrancar YA (ej: "Abre el documento y escribe solo el título").
- "steps": entre 2 y 7 pasos, ordenados, cada uno empieza por un verbo y es concreto y realizable.
- Cada paso con "minutes" realista (1-20).
- Responde en español, tono cercano y motivador pero sin florituras.`,
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('break-task error:', error)
    return Response.json({ error: 'Error al generar los pasos' }, { status: 500 })
  }
}
