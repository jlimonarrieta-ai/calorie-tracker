# CalTrack

Calorie tracker app — Expo (React Native) + Supabase + TypeScript.

## Stack

- **Expo SDK 54** with expo-router (file-based routing)
- **TypeScript**
- **Supabase** (auth + Postgres + storage)
- **NativeWind** (Tailwind for RN)
- **victory-native** (charts)

## Setup

1. Install Node 22+ and the Expo Go app on your phone.
2. Clone and install:
   ```bash
   git clone https://github.com/jlimonarrieta-ai/calorie-tracker.git
   cd calorie-tracker
   npm install --legacy-peer-deps
   ```
3. Copy `.env.example` to `.env` and fill in your Supabase keys.
4. Run:
   ```bash
   npm start
   ```
   Scan the QR with Expo Go (iOS) or the Expo Go app (Android).

## Project structure

```
app/                # expo-router routes
  (auth)/           # login flow (no tabs)
  (tabs)/           # main tabbed app
lib/                # Supabase client, auth context, helpers
components/         # reusable UI
types/              # shared TS types
```

## Roadmap

**v1 (MVP)** — shipped
- [x] Email/password auth (sign-up redirect deep-linked via `expo-linking`)
- [x] Food autocomplete (Open Food Facts)
- [x] Quantity → calorie/macro calculation
- [x] Daily log (kcal total + per-entry delete)

**v1 (MVP)** — P0 in progress
- [ ] Goals & onboarding (Mifflin-St Jeor; gram targets for P/C/G; wire `profiles.daily_calorie_goal`)
- [ ] Meal grouping (breakfast/lunch/dinner/snack)
- [ ] Daily summary with macros (replaces hardcoded 2000 kcal)
- [ ] Barcode scanner (free forever)
- [ ] Edit entries
- [ ] Quick-log (recents + favorites)
- [ ] Weight tracking

**v1.x** — P1 fast-follow
- [ ] Custom foods + Mexico OFF filter
- [ ] Micronutrients (Na, K, Fe, Ca, fiber)
- [ ] Copy day / repeat meal
- [ ] Weekly/monthly charts

**v2**
- [ ] USDA FoodData Central as secondary source
- [ ] Apple Health sync (weight + active calories)
- [ ] InBody CSV import
- [ ] Photo → calories (GPT-4o vision)
- [ ] Smart reminders + iCal export
- [ ] iOS home screen widget
- [ ] Apple Watch companion
- [ ] Voice logging (Siri Shortcuts)

## Auth setup (Supabase dashboard)

For email confirmation links to work in dev and prod, set the following in **Supabase → Authentication → URL Configuration**:

- **Site URL**: `caltrack://` (or your Expo Go proxy URL for development)
- **Redirect URLs (allow list)**: add both `caltrack://**` and the Expo Go proxy URL printed by `npx expo start`.

Without this, the link in the confirmation email points to `localhost` and fails to deep-link back into the app.
