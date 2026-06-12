const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes'

export async function POST(request: Request) {
  const apiKey = process.env.SPOONACULAR_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Spoonacular API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { minProtein, maxProtein, minCalories, maxCalories, maxFat, minCarbs, maxCarbs, number = 3, random = false } = body as {
      minProtein?: number
      maxProtein?: number
      minCalories?: number
      maxCalories?: number
      maxFat?: number
      minCarbs?: number
      maxCarbs?: number
      number?: number
      random?: boolean
    }

    const params = new URLSearchParams({
      apiKey,
      number: String(number),
    })

    if (minProtein) params.set('minProtein', String(minProtein))
    if (maxProtein) params.set('maxProtein', String(maxProtein))
    if (minCalories) params.set('minCalories', String(minCalories))
    if (maxCalories) params.set('maxCalories', String(maxCalories))
    if (maxFat) params.set('maxFat', String(maxFat))
    if (minCarbs) params.set('minCarbs', String(minCarbs))
    if (maxCarbs) params.set('maxCarbs', String(maxCarbs))
    if (random) params.set('random', 'true')

    const res = await fetch(`${SPOONACULAR_BASE}/findByNutrients?${params}`)
    if (!res.ok) {
      const errText = await res.text()
      console.error('Spoonacular error:', res.status, errText)
      return Response.json({ error: 'Spoonacular API error' }, { status: res.status })
    }

    const recipes = await res.json()

    const simplified = recipes.map((r: { id: number; title: string; image: string; calories: number; protein: string; carbs: string; fat: string }) => ({
      id: r.id,
      title: r.title,
      image: r.image,
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
    }))

    return Response.json({ recipes: simplified })
  } catch (error) {
    console.error('Error fetching recipes:', error)
    return Response.json({ error: 'Failed to fetch recipes' }, { status: 500 })
  }
}
