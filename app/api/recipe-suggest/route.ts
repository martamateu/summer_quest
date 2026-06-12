import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mealLabel, baseMeal, targetMacros, dayType } = body as {
      mealLabel: string
      baseMeal: string
      targetMacros: { kcal: number; protein: number; carbs: number; fat: number }
      dayType: 'entreno' | 'descanso'
    }

    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      prompt: `Eres un nutricionista deportivo. Sugiere UNA receta alternativa para "${mealLabel}" (${dayType === 'entreno' ? 'día de entreno' : 'día de descanso'}).

La comida base del plan es: ${baseMeal}

Los macros objetivo para esta comida son:
- ${targetMacros.kcal} kcal
- ${targetMacros.protein}g proteína
- ${targetMacros.carbs}g carbohidratos  
- ${targetMacros.fat}g grasa

Reglas:
- La receta debe cumplir EXACTAMENTE estos macros (±10%)
- Ingredientes accesibles en un supermercado español (Mercadona, Lidl)
- Puede ser creativa pero saludable
- NO freír, usar plancha/horno/freidora de aire
- Salsas solo si son <100kcal/100g
- Incluir gramos exactos de cada ingrediente

Responde SOLO con la receta en 2-3 líneas. Sin títulos ni explicaciones extra. Formato:
[Ingredientes con gramos] → [Preparación breve]`,
    })

    return Response.json({ suggestion: text })
  } catch (error) {
    console.error('Error generating recipe:', error)
    return Response.json({ error: 'Failed to generate recipe' }, { status: 500 })
  }
}
