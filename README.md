# Summer Quest

Summer Quest es una app personal de productividad y salud que une hábitos, finanzas, comida, gimnasio, pasos, foco y administración diaria en un dashboard mobile-first.

Construida con **Next.js 16**, **React 19**, **TypeScript**, **Tailwind 4** y **shadcn/ui**. La app es offline-first: guarda estado en `localStorage`, sincroniza con **Upstash Redis** y usa **Gemini** a través del SDK `ai` para tareas de IA.

## Qué resuelve

- Registrar el día a día sin abrir diez apps distintas.
- Mantener datos locales y sincronizarlos en la nube sin perder el modo offline.
- Convertir texto, voz y capturas en información estructurada.
- Ver progreso real: hábitos, pasos, gym, finanzas, ciclo y foco.

## Pantallas

### Hoy

- Hábitos no negociables por área.
- Anillo de progreso del día.
- Pasos, tiempo de pantalla y foco / Pomodoro.
- Ayuda 2 min para romper tareas bloqueadas en mini pasos.
- Modo de día para orientar rutinas según energía, calma, productividad o admin.

### Food

- Plan de comidas con macros para días de entrenamiento y descanso.
- Recetas sugeridas por IA y recetas guardadas.

### Finanzas

- Gastos e ingresos con captura manual y OCR de tickets.
- Auto-categorización por palabras clave.
- Vista por día, mes y resumen mensual exportable.
- Informe mensual en Markdown o PDF.

### Gym

- Rutina A/B/C y registro de series.
- Analítica semanal y mensual.
- Sincronización con Google Sheets.
- Base lista para OCR de entrenos y coach con IA sensible al ciclo.

### Stats

- Resumen de hábitos y métricas clave.
- Explorador de pasos con navegación por meses y años.
- Espacio para evolucionar hacia rutinas hechas, foco y métricas más claras.

### Admin Life

- Captura de notas y lista de la compra por texto o voz.
- Base para limpieza, ciclo y otras pantallas de administración personal.

### Carreras secundarias

- Carrera.
- Quests.

## Arquitectura

La app sigue este flujo:

1. El usuario interactúa en la web.
2. La app guarda el estado localmente en `localStorage`.
3. Un evento `sq-data-changed` dispara la sincronización.
4. Los datos se suben a **Upstash Redis**.
5. Al montar la app o volver al foreground, se descarga la versión de nube.
6. Android aporta pasos y, según el caso, otras métricas de salud.
7. Los endpoints de IA procesan OCR, clasificación y resúmenes.

### Sync model

- Las claves tipo array se fusionan por `id`.
- Las claves tipo objeto usan estrategia local-wins.
- Los históricos relevantes, como pasos, se guardan por fecha para permitir backfill real.

## Stack

- **Framework:** Next.js 16 + React 19 + TypeScript
- **UI:** Tailwind 4 + shadcn/ui + Lucide
- **Storage:** `localStorage` + Upstash Redis
- **IA:** Gemini con `ai` + `zod`
- **Gym sync:** Google Sheets
- **Mobile companion:** Android/Kotlin
- **Deploy:** Vercel desde `main`

## APIs

- `POST /api/analyze-receipt` - OCR de tickets a gastos
- `POST /api/break-task` - desglosar una tarea en mini pasos
- `POST /api/recipe-suggest` - sugerencias de recetas
- `GET/POST /api/sync-data` - backup/restore del estado local
- `GET/POST /api/sync-sheet` - sincronización con Google Sheets
- `GET/POST /api/steps` - pasos y calorías
- `GET/POST /api/screen-time` - tiempo de pantalla
- `GET/POST /api/fcm-token` - guardar token FCM
- `POST /api/trigger-sync` - despertar Android
- `POST /api/home-config` - convertir texto en configuración estructurada
- `POST /api/note-capture` - texto o voz a nota / compra
- `POST /api/cycle-insights` - regularidad del ciclo + insights suaves con IA
- `GET /api/strava/authorize` - inicia OAuth con Strava
- `GET /api/strava/callback` - callback OAuth de Strava
- `GET /api/strava/sync` - importa carreras de Strava
- `GET/DELETE /api/strava/status` - estado / desconexión de Strava

## Variables de entorno

```env
# Auth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_EMAILS=

# AI / APIs
GOOGLE_GENERATIVE_AI_API_KEY=
SPOONACULAR_API_KEY=

# Strava
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=

# Cloud storage
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Android sync
STEPS_API_TOKEN=
FIREBASE_SERVICE_ACCOUNT_JSON=

# Gym sync
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
```

## Desarrollo local

```bash
npm install
npm run dev
```

## Estado actual del roadmap

### Ya entregado

- Ayuda 2 min.
- Export mensual de finanzas.
- Stats de gym semana / mes.
- Explorador de pasos por meses y años.
- Admin Life base con notas y súper.
- Histórico de pasos multi-año vía `steps:daily`.
- Home / dashboard con métricas clave, Pomodoro y acceso a todas las áreas.
- Admin Life con base de limpieza automática y `sq_cycle` ya modelado.

### En curso

- Calendario de limpieza en Admin Life.
- `sq_cycle` compartido + calendario del periodo.
- Deep Work persistente fuera del modal.
- Rediseño de Hoy con modos de día.
- Overhaul de Stats para rutinas.
- Pantalla de metas anuales.
- OCR de entrenos en Gym.

### Más adelante

- Import CSV de finanzas.
- Tracking de peso.
- Screen de libros.
- Nómina + OCR de PDF.
- Food photo OCR.
- Gym coach con IA sensible al ciclo.
- Wishlist con tracking de precios.

## Cómo evoluciona

La idea es construir el producto por capas:

1. Guardar lo básico de forma local.
2. Sincronizar bien entre dispositivos.
3. Convertir entradas manuales en datos estructurados con IA.
4. Llevar esos datos a pantallas más útiles: rutinas, ciclo, focus, salud y objetivos.

Si un bloque ya está en **Ya entregado**, no hace falta rehacerlo antes de seguir avanzando.

## Nota

Proyecto privado. No redistribuir.
