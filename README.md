# FIT.AI API (treinos-api)

Backend for [FIT.AI](https://github.com/MAGAIVERH/treinos-frontend): REST API, authentication, workout data, and **Coach AI** (Google Gemini) with tool calling for plan creation and updates.

## Stack

- **Fastify 5** + Zod schemas
- **Prisma 7** + Neon PostgreSQL
- **Better Auth** (Google OAuth, sessions)
- **Vercel AI SDK** + Gemini 2.5 Flash
- **OpenAPI** / Scalar API reference

## Quick start

```bash
pnpm install
cp .env.example .env   # if present; otherwise create .env manually
pnpm exec prisma migrate deploy
pnpm dev
```

Default port: **8081**.

### Environment variables

```env
PORT=8081
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=...
API_BASE_URL=http://localhost:3000
WEB_APP_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GENERATIVE_AI_API_KEY=...
NODE_ENV=development
```

`API_BASE_URL` and `WEB_APP_BASE_URL` must be the **frontend** origin (OAuth callbacks).

## AI coach

- **POST `/ai/`** — streaming chat (AI SDK UI message format)
- **GET `/ai/conversation`** — conversation history for the authenticated user

The system prompt instructs the model to respond in **English** and to use English names for plans, days, and exercises.

### Tools

| Tool | Purpose |
| --- | --- |
| `getUserTrainData` | Read user body metrics |
| `updateUserTrainData` | Save profile (weight in grams) |
| `getWorkoutPlans` | List plans (`active: true` for current plan) |
| `createWorkoutPlan` | New 7-day plan |
| `updateWorkoutPlan` | Partial updates to active plan |

## Deploy

Designed for **Vercel** with `vercel-build` running Prisma migrations. Pair with the [frontend](https://github.com/MAGAIVERH/treinos-frontend) repo; see that README for OAuth and env setup.

## License

MIT
