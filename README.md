# Summer Quest 🏆

Personal all-in-one productivity app that gamifies daily habits, finances, nutrition, gym training and health metrics into a single mobile-first dashboard.

**Live**: [summer-quest-self.vercel.app](https://summer-quest-self.vercel.app)

---

## Architecture

![Summer Quest Architecture](public/architecture-diagram.png)

---

## Screens

| Tab | Screen | Description |
|-----|--------|-------------|
| 🏠 **Hoy** | Today Dashboard | Daily non-negotiable habits (20 habits across 6 areas), streaks, steps counter, screen time, Pomodoro deep work timer |
| 🍽️ **Food** | Nutrition Tracker | 5 meals/day with pre-configured macros for training vs rest days. Recipe suggestions via Spoonacular API (comida & cena only) |
| 💰 **Finanzas** | Finance Tracker | OCR receipt scanner (Gemini AI), manual entry, 11 expense categories, income tracking, daily/weekly/monthly views, streak of days under 10€ |
| 🏋️ **Gym** | Strength Training | 3-workout A/B/C rotation, weight×reps tracking, progression analytics, auto-sync to Google Sheets |
| 📊 **Stats** | Analytics | Habit completion %, streaks, daily/weekly/monthly steps, weekly bar charts, per-area breakdowns |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router) + React 19 + TypeScript |
| **Styling** | Tailwind CSS 4 + shadcn/ui + Lucide icons |
| **Auth** | NextAuth v5 (beta) with Google OAuth + email whitelist |
| **Client Storage** | localStorage (habits, expenses, food logs, gym logs) |
| **Cloud Backup** | Upstash Redis — cross-device sync with merge-by-ID |
| **Receipt OCR** | Google Gemini 2.5 Flash via `@ai-sdk/google` + Zod structured output |
| **Recipe AI** | Spoonacular `findByNutrients` API — real recipes with images & macros |
| **Gym Sync** | Google Sheets API (`googleapis`) — writes workouts to shared spreadsheet |
| **Push Sync** | Firebase Cloud Messaging — triggers Android companion to upload health data |
| **Deployment** | Vercel (auto-deploy from `main`) |
| **Mobile Companion** | Android app (Kotlin) — Health Connect steps + UsageStatsManager screen time |

---

## API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/analyze-receipt` | POST | Receipt OCR → structured expense items (Gemini) | Session |
| `/api/recipe-suggest` | POST | Find recipes by macro constraints (Spoonacular) | Bypass |
| `/api/sync-data` | GET/POST | Cloud backup & restore all localStorage data (Redis) | Session |
| `/api/sync-sheet` | POST/GET | Write gym workouts to Google Sheets | Session |
| `/api/steps` | GET/POST | Steps tracking from Android | Bearer token |
| `/api/screen-time` | GET/POST | Screen time from Android | Bearer token |
| `/api/fcm-token` | GET/POST | Store Firebase push token | Bearer token |
| `/api/trigger-sync` | POST | Send silent FCM push to wake Android app | Bypass |

---

## Data Flow

### Cross-Device Sync
```
localStorage → POST /api/sync-data → Upstash Redis ← GET /api/sync-data → localStorage
```
- **Upload**: Debounced (300ms) + flush via `sendBeacon` on page hide/close
- **Download**: On mount + on visibility change (app foregrounded)
- **Merge**: Array keys (`sq_expenses`, `sq_gym_logs`) merged by unique `id` — no duplicates
- **Non-array keys**: Cloud restores only when local is empty

### Android Health Sync
```
Web → POST /api/trigger-sync → FCM → Android wakes up
→ reads Health Connect + UsageStats
→ POSTs to /api/steps & /api/screen-time → Redis
→ Web re-fetches after 5s → UI updates
```

---

## Environment Variables

```env
# Auth
AUTH_SECRET=                         # NextAuth secret
AUTH_GOOGLE_ID=                      # Google OAuth client ID
AUTH_GOOGLE_SECRET=                  # Google OAuth client secret
ALLOWED_EMAILS=                      # Comma-separated whitelist

# AI / APIs
GOOGLE_GENERATIVE_AI_API_KEY=        # Google AI Studio (Gemini OCR)
SPOONACULAR_API_KEY=                 # Spoonacular food API

# Cloud Storage
UPSTASH_REDIS_REST_URL=              # Upstash console
UPSTASH_REDIS_REST_TOKEN=            # Upstash console

# Android Sync
STEPS_API_TOKEN=                     # Bearer token for Android → API
FIREBASE_SERVICE_ACCOUNT_JSON=       # Firebase service account (single line JSON)

# Gym Sync
GOOGLE_SHEETS_CLIENT_EMAIL=          # Service account email
GOOGLE_SHEETS_PRIVATE_KEY=           # Service account private key
```

---

## Local Development

```bash
npm install
npm run dev          # http://localhost:3000
```

---

## Next Steps

### Technical Improvements
- [ ] **Optimize bundle size** — Implement lazy loading for Food/Gym/Stats screens to reduce initial JavaScript
- [ ] **Error boundaries** — Add React error boundaries in each main screen for better crash UX
- [ ] **Testing** — Unit tests with Vitest for critical functions (mergeArraysById, date sanitization, macro calculations)
- [ ] **Loading states** — Add skeletons instead of spinners for better perceived performance
- [ ] **Accessibility** — Audit ARIA labels, keyboard navigation and color contrast
- [ ] **Performance monitoring** — Integrate Vercel Analytics and Web Vitals tracking
- [ ] **Type safety** — Migrate all API calls to tRPC for end-to-end type-safety
- [ ] **Data validation** — Add Zod schemas to validate localStorage data on load (prevent corruption)

---

## Feature Roadmap

- [ ] **Gym rest timer** — Configurable countdown between sets with sound notification and vibration
- [ ] **Edit saved expenses** — Modify description, amount, category and date of already saved expenses
- [ ] **New habit areas** — Add Nails, Skin Care, Hair, AI and Investments with specific habits per area
- [ ] **Food photo calorie counter** — Scan food photo with AI to estimate calories and macros automatically (similar to receipt OCR)
- [ ] **Link habits to Pomodoro** — Associate specific habits with Pomodoro timer (e.g., "Study AI 25min" counts towards AI habit)
- [ ] **Sleep tracker** — Log sleep hours, quality (1-5), bedtime/wake time, streak of 8h+ nights
- [ ] **Recipe favorites** — Save favorite recipes, filter by cooking time, create weekly meal prep plans
- [ ] **Budget goals** — Set monthly savings targets with visual progress, alerts when exceeding limit
- [ ] **PWA offline mode** — Service worker to function without connection, sync when internet returns

---

## License

Private project — not for redistribution.