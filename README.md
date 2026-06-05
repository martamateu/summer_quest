# Summer Quest App

App personal de productividad y gamificación para el verano. Convierte tus hábitos, finanzas y objetivos de carrera en una quest épica.

## Secciones

| Tab | Descripción |
|-----|-------------|
| **Hoy** | Dashboard diario con hábitos, métricas (pasos, pantalla, deep work) y timer Pomodoro |
| **Quests** | Seguimiento de hábitos organizados por área (salud, mente, digital, finanzas, carrera, bienestar) |
| **Finanzas** | Registro de gastos con escáner de tickets por IA, racha de días bajo 10 EUR y total mensual |
| **Carrera** | Hábitos y objetivos de carrera profesional |
| **Stats** | Estadísticas de progreso de hábitos por área |

## Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + Tailwind CSS 4 + shadcn/ui
- **IA**: Vercel AI SDK + GPT-4o-mini (análisis de tickets)
- **Lenguaje**: TypeScript

## Instalación

```bash
pnpm install
```

## Variables de entorno

Crea un archivo `.env.local` en la raíz:

```env
AI_GATEWAY_API_KEY=tu_api_key_aqui
```

> Necesaria para que el escáner de tickets funcione. Ver sección [Finanzas – requisitos](#finanzas--requisitos) más abajo.

## Desarrollo

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Finanzas – requisitos

Para que el escáner de tickets con IA funcione necesitas una API Key. Ver detalles en la sección siguiente del README.

---

## Estado actual

Los datos (gastos, hábitos, métricas) se guardan solo en memoria de React — se pierden al recargar la página. No hay base de datos ni autenticación todavía.
