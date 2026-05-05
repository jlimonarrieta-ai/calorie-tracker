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

**v1 (MVP)**
- [x] Email/password auth
- [ ] Food autocomplete (Open Food Facts + USDA)
- [ ] Quantity → calorie/macro calculation
- [ ] Daily log
- [ ] Weekly/monthly charts
- [ ] Share diary read-only with another user

**v2**
- [ ] Apple Health sync (weight + active calories)
- [ ] InBody CSV import
- [ ] Photo → calories (GPT-4o vision)
- [ ] Smart reminders + iCal export
- [ ] iOS home screen widget
