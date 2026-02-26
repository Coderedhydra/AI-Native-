# AI-Native Project Architect

A high-end dark-mode Next.js app that architects AI-native projects with Gemini, shows real-time Agent Logs, and generates milestone-level boilerplate code.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- shadcn/ui-style reusable components
- Lucide icons
- Google Gemini API (REST)

## Run locally

```bash
npm install
npm run dev
```

Create `.env.local`:

```bash
# Option A: single key
GEMINI_API_KEY=your_key_here

# Option B: fallback keys (recommended)
GEMINI_API_KEYS=key_1,key_2
```

## Build and start production

```bash
npm run build
npm run start
```

## If build fails on your machine

- If you see `Failed to load plugin 'prettier' declared in PersonalConfig`, this project now ships a local root ESLint config (`.eslintrc.json`) so your global ESLint config is ignored.
- If you see missing types for `react-syntax-highlighter`, ensure dependencies were installed after pulling latest changes (`@types/react-syntax-highlighter` is included in `devDependencies`).

## Gemini key fallback behavior

- The app supports key failover.
- It first reads `GEMINI_API_KEYS` (comma-separated), and also supports `GEMINI_API_KEY`.
- If one key fails, it automatically retries with the next key.

## Gemini wiring details

- `app/api/architect/route.ts` streams NDJSON events for live `Agent Logs` and emits the final strict plan JSON.
- `lib/gemini.ts` centralizes Gemini REST integration, key failover, and response parsing.
- `app/actions.ts` exposes milestone boilerplate generation through a server action.

The architecture JSON shape is:
- `techStack: string[]`
- `milestones: string[5]`
- `aiNativeShortcuts: string[3]`

## Notes

- The UI uses glassmorphism styling with responsive layout and an `Agent Logs` sidebar.
- Generated milestone code is displayed in a syntax-highlighted block.
