const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes'

export async function POST(request: Request) {
  const apiKey = process.env.SPOONACULAR_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Spoonacular API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { minProtein, maxCalories, maxFat, maxCarbs, number = 3 } = body as {
      minProtein?: number
      maxCalories?: number
      maxFat?: number
      maxCarbs?: number
      number?: number
    }

    const params = new URLSearchParams({
      apiKey,
      number: String(number),
    })

    if (minProtein) params.set('minProtein', String(minProtein))
    if (maxCalories) params.set('maxCalories', String(maxCalories))
    if (maxFat) params.set('maxFat', String(maxFat))
    if (maxCarbs) params.set('maxCarbs', String(maxCarbs))

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
