import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const maxDuration = 60

// IDs válidos del catálogo (mantenidos en sync con lib/cleaning-templates.ts)
const VALID_TEMPLATE_IDS = [
  'floor', 'bed', 'sofa', 'wardrobe', 'shoe_rack', 'cabinet', 'drawer', 'shelf',
  'washing_machine', 'sink', 'kitchen_sink', 'toilet', 'bathtub', 'countertop',
  'hob', 'hood', 'oven', 'fridge', 'desk', 'monitor', 'laptop', 'tv', 'tv_unit',
  'alexa', 'window', 'door', 'switch', 'socket', 'ceiling', 'lamp', 'balcony', 'laundry',
] as const

const HomeObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateId: z.enum(VALID_TEMPLATE_IDS),
  config: z.record(z.string(), z.unknown()).optional(),
  overrides: z.record(z.string(), z.object({ frequencyDays: z.number().optional() })).optional(),
})

const HomeAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  objects: z.array(HomeObjectSchema),
})

const HomeDataSchema = z.object({
  home: z.object({
    id: z.string(),
    name: z.string(),
    areas: z.array(HomeAreaSchema),
  }),
})

const SYSTEM_PROMPT = `Eres un Home Configuration Engine especializado en mantenimiento y limpieza del hogar.

Tu única función es construir el inventario estructurado de una vivienda utilizando EXCLUSIVAMENTE las plantillas del catálogo.

FILOSOFÍA:
- Las viviendas NO almacenan tareas. Solo almacenan áreas, objetos y templateId.
- Cada objeto referencia una plantilla del catálogo.
- Si un objeto existe varias veces, crea varias instancias con la misma plantilla.
- Nunca inventes plantillas. Nunca copies tareas dentro del home.
- Usa config y overrides solo cuando sea necesario.

CATÁLOGO DE PLANTILLAS DISPONIBLES (usa ÚNICAMENTE estos templateId):
floor, bed, sofa, wardrobe, shoe_rack, cabinet, drawer, shelf,
washing_machine, sink, kitchen_sink, toilet, bathtub, countertop,
hob, hood, oven, fridge, desk, monitor, laptop, tv, tv_unit,
alexa, window, door, switch, socket, ceiling, lamp, balcony, laundry

REGLAS DE IDs:
- area.id: snake_case descriptivo (ej. "bano", "cocina", "estudio")
- object.id: area_id + "_" + templateId + número si hay varios (ej. "bano_floor", "cocina_cabinet_1")

REGLAS ESPECIALES:
- Las sábanas pertenecen a "bed", no a "laundry".
- "laundry" es una sola instancia que cubre toda la colada.
- Los rodapiés no tienen plantilla propia: tratar como parte del floor con override de mayor frecuencia.
- Si el usuario describe varias ventanas, crea una instancia "window" por estancia con ventana (no una por cristal).

Responde ÚNICAMENTE con el JSON válido solicitado. Sin texto adicional. Sin Markdown. Sin bloques de código.`

export async function POST(request: Request) {
  try {
    const { description } = await request.json()

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return Response.json({ error: 'Descripción de la vivienda demasiado corta' }, { status: 400 })
    }

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: HomeDataSchema,
      messages: [
        { role: 'user', content: SYSTEM_PROMPT },
        { role: 'user', content: `Descripción de la vivienda:\n\n${description.trim()}` },
      ],
    })

    return Response.json(object)
  } catch (error) {
    console.error('home-config error:', error)
    return Response.json({ error: 'Error al generar la configuración de la vivienda' }, { status: 500 })
  }
}
