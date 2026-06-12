# Summer Quest 🏆

Aplicación personal todo-en-uno de productividad que gamifica hábitos diarios, finanzas, nutrición, entrenamiento de gimnasio y métricas de salud en un único dashboard mobile-first.

**Live**: [summer-quest-self.vercel.app](https://summer-quest-self.vercel.app)

---

## Arquitectura

![Summer Quest Architecture](public/architecture-diagram.svg)

---

## Pantallas

| Pestaña | Pantalla | Descripción |
|---------|----------|-------------|
| 🏠 **Hoy** | Dashboard Diario | Hábitos diarios no-negociables (20 hábitos en 6 áreas), rachas, contador de pasos, tiempo de pantalla, temporizador Pomodoro |
| 🍽️ **Food** | Tracker de Nutrición | 5 comidas/día con macros preconfigurados para días de entreno vs descanso. Sugerencias de recetas vía Spoonacular API (solo comida y cena) |
| 💰 **Finanzas** | Tracker de Finanzas | Escáner OCR de tickets (Gemini AI), entrada manual, 11 categorías de gastos, tracking de ingresos, vistas diaria/semanal/mensual, racha de días bajo 10€ |
| 🏋️ **Gym** | Entrenamiento de Fuerza | Rotación de 3 entrenamientos A/B/C, tracking de peso×reps, analítica de progresión, auto-sync a Google Sheets |
| 📊 **Stats** | Analíticas | % completado de hábitos, rachas, pasos diarios/semanales/mensuales, gráficos de barras semanales, desglose por área |

---

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| **Framework** | Next.js 16 (App Router) + React 19 + TypeScript |
| **Estilos** | Tailwind CSS 4 + shadcn/ui + Lucide icons |
| **Autenticación** | NextAuth v5 (beta) con Google OAuth + whitelist de emails |
| **Almacenamiento Cliente** | localStorage (hábitos, gastos, logs de comida, logs de gym) |
| **Backup en la Nube** | Upstash Redis — sincronización cross-device con merge-by-ID |
| **OCR de Tickets** | Google Gemini 2.5 Flash vía `@ai-sdk/google` + structured output con Zod |
| **IA de Recetas** | Spoonacular API `findByNutrients` — recetas reales con imágenes y macros |
| **Sync de Gym** | Google Sheets API (`googleapis`) — escribe entrenamientos en hoja compartida |
| **Push Sync** | Firebase Cloud Messaging — dispara app companion de Android para subir datos de salud |
| **Deployment** | Vercel (auto-deploy desde `main`) |
| **Companion Móvil** | App Android (Kotlin) — Health Connect pasos + UsageStatsManager tiempo de pantalla |

---

## Rutas de API

| Ruta | Método | Propósito | Auth |
|------|--------|-----------|------|
| `/api/analyze-receipt` | POST | OCR de tickets → items de gastos estructurados (Gemini) | Session |
| `/api/recipe-suggest` | POST | Encontrar recetas por restricciones de macros (Spoonacular) | Bypass |
| `/api/sync-data` | GET/POST | Backup y restore de todos los datos de localStorage (Redis) | Session |
| `/api/sync-sheet` | POST/GET | Escribir entrenamientos de gym a Google Sheets | Session |
| `/api/steps` | GET/POST | Tracking de pasos desde Android | Bearer token |
| `/api/screen-time` | GET/POST | Tiempo de pantalla desde Android | Bearer token |
| `/api/fcm-token` | GET/POST | Almacenar token de Firebase push | Bearer token |
| `/api/trigger-sync` | POST | Enviar push silencioso FCM para despertar app Android | Bypass |

---

## Flujo de Datos

### Sincronización Cross-Device
```
localStorage → POST /api/sync-data → Upstash Redis ← GET /api/sync-data → localStorage
```
- **Upload**: Debounced (300ms) + flush vía `sendBeacon` al ocultar/cerrar página
- **Download**: Al montar + al cambio de visibilidad (app en foreground)
- **Merge**: Keys de arrays (`sq_expenses`, `sq_gym_logs`) se fusionan por `id` único — sin duplicados
- **Keys no-array**: La nube solo restaura cuando local está vacío

### Sincronización de Salud Android
```
Web → POST /api/trigger-sync → FCM → Android se despierta
→ lee Health Connect + UsageStats
→ hace POST a /api/steps & /api/screen-time → Redis
→ Web vuelve a consultar después de 5s → UI se actualiza
```

---

## Variables de Entorno

```env
# Auth
AUTH_SECRET=                         # NextAuth secret
AUTH_GOOGLE_ID=                      # Google OAuth client ID
AUTH_GOOGLE_SECRET=                  # Google OAuth client secret
ALLOWED_EMAILS=                      # Whitelist separado por comas

# AI / APIs
GOOGLE_GENERATIVE_AI_API_KEY=        # Google AI Studio (Gemini OCR)
SPOONACULAR_API_KEY=                 # Spoonacular food API

# Cloud Storage
UPSTASH_REDIS_REST_URL=              # Consola Upstash
UPSTASH_REDIS_REST_TOKEN=            # Consola Upstash

# Android Sync
STEPS_API_TOKEN=                     # Bearer token para Android → API
FIREBASE_SERVICE_ACCOUNT_JSON=       # Service account de Firebase (JSON en una línea)

# Gym Sync
GOOGLE_SHEETS_CLIENT_EMAIL=          # Email de service account
GOOGLE_SHEETS_PRIVATE_KEY=           # Private key de service account
```

---

## Desarrollo Local

```bash
npm install
npm run dev          # http://localhost:3000
```

---

## Próximos Pasos

### Mejoras Técnicas Inmediatas
- [ ] **Optimizar bundle size** — Implementar lazy loading en pantallas Food/Gym/Stats para reducir JavaScript inicial
- [ ] **Error boundaries** — Añadir error boundaries de React en cada pantalla principal para mejor UX en crashes
- [ ] **Testing** — Unit tests con Vitest para funciones críticas (mergeArraysById, date sanitization, macro calculations)
- [ ] **Loading states** — Añadir skeletons en lugar de spinners para mejor percepción de velocidad
- [ ] **Accessibility** — Auditoría ARIA labels, keyboard navigation y contraste de colores
- [ ] **Performance monitoring** — Integrar Vercel Analytics y Web Vitals tracking
- [ ] **Type safety** — Migrar todas las llamadas a API a use tRPC para type-safety end-to-end
- [ ] **Data validation** — Añadir Zod schemas para validar datos de localStorage al cargar (evitar corrupciones)

---

## Roadmap de Funcionalidades

- [ ] **Temporizador de descanso en Gym** — Cuenta atrás configurable entre series con notificación sonora y vibración
- [ ] **Editar gastos guardados** — Modificar descripción, importe, categoría y fecha de gastos ya registrados
- [ ] **Nuevas áreas de hábitos** — Añadir Uñas, Skin Care, Pelo, IA e Inversiones con hábitos específicos por área
- [ ] **Contador de calorías por foto** — Escanear foto de la comida con IA para estimar calorías y macros automáticamente (similar a OCR de tickets)
- [ ] **Vincular hábitos a Pomodoro** — Asociar hábitos específicos al temporizador Pomodoro (ej: "Estudiar IA 25min" cuenta para hábito IA)
- [ ] **Tracker de sueño** — Registro de horas de sueño, calidad (1-5), hora de acostar/despertar, racha de 8h+ por noche
- [ ] **Favoritos de recetas** — Guardar recetas favoritas, filtrar por tiempo de cocción, crear meal prep plans semanales
- [ ] **Objetivos de ahorro** — Establecer metas de ahorro mensual con progreso visual, alertas cuando te pasas del límite
- [ ] **Modo offline PWA** — Service worker para funcionar sin conexión, sync cuando vuelve internet

---

## Licencia

Proyecto privado — no para redistribución.