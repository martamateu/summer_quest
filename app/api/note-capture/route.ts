import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 30

const NoteSchema = z.object({
  kind: z
    .enum(['nota', 'compra', 'tarea'])
    .describe('"compra" si es una lista de la compra / súper; "tarea" si describe cosas por hacer; "nota" para el resto'),
  area: z
    .enum(['salud', 'finanzas', 'carrera', 'hogar', 'compra', 'personal', 'otros'])
    .describe('Área temática de la nota'),
  title: z.string().describe('Título muy corto (2-5 palabras) que resuma la nota'),
  items: z
    .array(z.string())
    .describe('Si es "compra" o "tarea" con varios elementos, cada elemento por separado y limpio (sin "y", sin números). Si no aplica, array vacío.'),
})

function splitItems(raw: string): string[] {
  return raw
    .split(/,| y | e |;|\n|\.|\-/gi)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return Response.json({ error: 'No text provided' }, { status: 400 })
    }

    const normalized = text.trim().toLowerCase()

    // Reglas directas: evita depender del modelo para comandos muy explícitos.
    if (normalized.startsWith('tarea ') || normalized === 'tarea' || normalized.startsWith('tareas ')) {
      const clean = text.trim().replace(/^tareas?\s*[:\-]?\s*/i, '')
      const items = splitItems(clean)
      return Response.json({
        kind: 'tarea',
        area: 'personal',
        title: items[0] || 'Nueva tarea',
        items,
      })
    }

    if (
      normalized.includes('comprar ') ||
      normalized.includes('compra ') ||
      normalized.includes('super ') ||
      normalized.includes('supermercado')
    ) {
      const clean = text.trim().replace(/^(comprar|compra|lista de la compra|lista del super)\s*[:\-]?\s*/i, '')
      const items = splitItems(clean)
      return Response.json({
        kind: 'compra',
        area: 'compra',
        title: items[0] || 'Lista de compra',
        items,
      })
    }

    const { object } = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: NoteSchema,
      messages: [
        {
          role: 'user',
          content: `Clasifica esta nota (puede venir de voz, así que puede ser informal) y extrae su estructura.

Nota: "${text.trim()}"

Reglas:
- "kind": "compra" si menciona productos para comprar (súper, supermercado, lista de la compra); "tarea" si son cosas por hacer; "nota" en cualquier otro caso.
- "area": clasifica el tema. Usa "compra" solo si kind es "compra".
- "title": resumen muy corto.
- "items": si es compra o una tarea con varios puntos, separa cada elemento limpio (ej: "leche, huevos y pan" -> ["Leche", "Huevos", "Pan"]). Si es una nota simple, deja el array vacío.
- Responde en español.`,
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('note-capture error:', error)
    return Response.json({ error: 'Error al procesar la nota' }, { status: 500 })
  }
}
