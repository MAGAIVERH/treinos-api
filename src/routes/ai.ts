import { google } from "@ai-sdk/google";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import {
  AIChatBodySchema,
  ErrorSchema,
  GetConversationSchema,
} from "../schemas/index.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetConversationMessages } from "../usecases/GetConversationMessages.js";
import { GetOrCreateConversation } from "../usecases/GetOrCreateConversation.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";
import { ListWorkoutPlans } from "../usecases/ListWorkoutPlans.js";
import { SaveMessages } from "../usecases/SaveMessages.js";
import { UpdateWorkoutPlan } from "../usecases/UpdateWorkoutPlan.js";
import { UpsertUserTrainData } from "../usecases/UpsertUserTrainData.js";

const SYSTEM_PROMPT = `You are a virtual personal trainer specializing in building personalized workout plans.

## Language
- **Always respond in English.** The app is for a US audience.
- Use day names, exercise names, and plan labels in English.

## Personality
- Friendly, motivating, and welcoming tone.
- Simple, direct language without technical jargon. Your main audience is beginners in strength training.
- Short, objective replies.

## Interaction Rules

1. **ALWAYS** call \`getUserTrainData\` and \`getWorkoutPlans\` (with \`active: true\`) at the start of every conversation, before replying to the user. This is mandatory.

2. **Returning user (profile saved + active plan):**
   - **DO NOT** redo onboarding or ask for weight, height, age, or body fat % again.
   - **DO NOT** create or recreate a workout plan automatically.
   - Greet them by name and offer adjustments: "Want to change an exercise, swap a day, or build a new plan?"
   - Only proceed with creation or updates when the user asks explicitly.

3. **User with no saved profile (\`getUserTrainData\` returns null):**
   - Ask for weight (kg), height (cm), age, and body fat % (integer 0–100, where 100 = 100%).
   - Ask simple, direct questions in a single message.
   - After receiving the data, save with \`updateUserTrainData\`. **IMPORTANT**: convert weight from kg to grams (multiply by 1000) before saving.

4. **User with saved profile but no active plan:**
   - Greet them by name.
   - Ask if they want to create a workout plan. **DO NOT** create one automatically.

5. **Creating a workout plan:**
   - **ONLY** when the user asks explicitly (e.g. "build my workout plan", "create a new plan", "I want a plan").
   - Ask about goals, available training days, and physical limitations before building.
   - The plan MUST have exactly 7 days (MONDAY through SUNDAY).
   - Non-training days must have: \`isRestDay: true\`, \`exercises: []\`, \`estimatedDurationInSeconds: 0\`.
   - Call \`createWorkoutPlan\` to save (this deactivates the user's previous plan).

6. **Targeted edits to an existing plan:**
   - When the user wants to change an exercise, swap a day, or adjust sets/reps.
   - Use \`getWorkoutPlans\` with \`active: true\` to get day IDs (\`workoutDayId\`).
   - Use \`updateWorkoutPlan\` for partial updates without rebuilding the whole plan.
   - For a completely new plan, use \`createWorkoutPlan\`.

### Training Splits

Choose the right split based on available days:
- **2–3 days/week**: Full Body or ABC (A: Chest+Triceps, B: Back+Biceps, C: Legs+Shoulders)
- **4 days/week**: Upper/Lower (recommended, each group 2x/week) or ABCD (A: Chest+Triceps, B: Back+Biceps, C: Legs, D: Shoulders+Core)
- **5 days/week**: PPLUL — Push/Pull/Legs + Upper/Lower (upper 3x, lower 2x/week)
- **6 days/week**: PPL 2x — Push/Pull/Legs repeated

### General Programming Principles
- Pair synergistic muscles (chest+triceps, back+biceps)
- Compound exercises first, isolation later
- 4 to 8 exercises per session
- 3–4 sets per exercise. 8–12 reps (hypertrophy), 4–6 reps (strength)
- Rest between sets: 60–90s (hypertrophy), 2–3 min (heavy compounds)
- Avoid training the same muscle group on consecutive days
- Use descriptive English names for each day (e.g. "Upper A - Chest and Back", "Rest")
- After successfully creating or updating a plan, tell the user to tap the button in the top-right corner (OPEN FIT.AI) to view their workout.

### Cover Images (coverImageUrl)

ALWAYS provide a \`coverImageUrl\` for each training day. Choose based on muscle focus:

**Mostly upper-body days** (chest, back, shoulders, biceps, triceps, push, pull, upper, full body):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL

**Mostly lower-body days** (legs, glutes, quads, hamstrings, calves, legs, lower):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY

Alternate between the two options in each category for variety. Rest days use an upper-body image.`;

export const aiRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/conversation",
    schema: {
      operationId: "getConversation",
      tags: ["AI"],
      summary: "Get authenticated user conversation history",
      response: {
        200: GetConversationSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });

        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getConversationMessages = new GetConversationMessages();
        const result = await getConversationMessages.execute({
          userId: session.user.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);

        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "chatWithAi",
      tags: ["AI"],
      summary: "Chat with AI personal trainer",
      body: AIChatBodySchema,
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      const userId = session.user.id;
      const { messages } = request.body;

      const getOrCreateConversation = new GetOrCreateConversation();
      const { conversationId } = await getOrCreateConversation.execute({ userId });

      const result = streamText({
        model: google("gemini-2.5-flash"),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages as UIMessage[]),
        stopWhen: stepCountIs(5),
        tools: {
          getUserTrainData: tool({
            description:
              "Fetches the authenticated user's training profile (weight, height, age, body fat %). Returns null if no profile exists.",
            inputSchema: z.object({}),
            execute: async () => {
              const getUserTrainData = new GetUserTrainData();
              return getUserTrainData.execute({ userId });
            },
          }),
          updateUserTrainData: tool({
            description:
              "Updates the authenticated user's training profile. Weight must be in grams (convert kg * 1000).",
            inputSchema: z.object({
              weightInGrams: z.number().describe("User weight in grams (e.g. 70kg = 70000)"),
              heightInCentimeters: z.number().describe("User height in centimeters"),
              age: z.number().describe("User age"),
              bodyFatPercentage: z
                .number()
                .int()
                .min(0)
                .max(100)
                .describe("Body fat percentage (0 to 100)"),
            }),
            execute: async (params) => {
              const upsertUserTrainData = new UpsertUserTrainData();
              return upsertUserTrainData.execute({ userId, ...params });
            },
          }),
          getWorkoutPlans: tool({
            description:
              "Lists the authenticated user's workout plans. Use active: true to check for an active plan at the start of a conversation.",
            inputSchema: z.object({
              active: z
                .boolean()
                .optional()
                .describe("Filter to active plan only (true) or all plans"),
            }),
            execute: async ({ active }) => {
              const listWorkoutPlans = new ListWorkoutPlans();
              return listWorkoutPlans.execute({ userId, active });
            },
          }),
          createWorkoutPlan: tool({
            description:
              "Creates a full workout plan for the user. Use ONLY when the user explicitly requests a new plan. Deactivates the user's previous active plan.",
            inputSchema: z.object({
              name: z.string().describe("Workout plan name (English)"),
              workoutDays: z
                .array(
                  z.object({
                    name: z.string().describe("Day name in English (e.g. Chest and Triceps, Rest)"),
                    weekDay: z.enum(WeekDay).describe("Day of week"),
                    isRest: z.boolean().describe("Whether it is a rest day (true) or training day (false)"),
                    estimatedDurationInSeconds: z
                      .number()
                      .describe("Estimated duration in seconds (0 for rest days)"),
                    coverImageUrl: z
                      .string()
                      .url()
                      .describe(
                        "Cover image URL for the training day. Use upper or lower body URLs based on muscle focus.",
                      ),
                    exercises: z
                      .array(
                        z.object({
                          order: z.number().describe("Exercise order within the day"),
                          name: z.string().describe("Exercise name in English"),
                          sets: z.number().describe("Number of sets"),
                          reps: z.number().describe("Number of reps"),
                          restTimeInSeconds: z
                            .number()
                            .describe("Rest between sets in seconds"),
                        }),
                      )
                      .describe("Exercise list (empty for rest days)"),
                  }),
                )
                .describe("Array with exactly 7 days (MONDAY through SUNDAY)"),
            }),
            execute: async (input) => {
              const createWorkoutPlan = new CreateWorkoutPlan();
              return createWorkoutPlan.execute({
                userId,
                name: input.name,
                workoutDays: input.workoutDays,
              });
            },
          }),
          updateWorkoutPlan: tool({
            description:
              "Updates specific days on the active plan without rebuilding the whole plan. Use for targeted edits (swap exercise, change sets/reps, rename day).",
            inputSchema: z.object({
              workoutPlanId: z
                .string()
                .uuid()
                .optional()
                .describe("Plan ID (optional; uses active plan if omitted)"),
              workoutDays: z
                .array(
                  z.object({
                    workoutDayId: z.string().uuid().describe("Workout day ID to update"),
                    name: z.string().optional().describe("New day name in English"),
                    isRest: z.boolean().optional().describe("Whether it is a rest day"),
                    estimatedDurationInSeconds: z
                      .number()
                      .optional()
                      .describe("Estimated duration in seconds"),
                    coverImageUrl: z.string().url().optional().describe("Cover image URL"),
                    exercises: z
                      .array(
                        z.object({
                          order: z.number().describe("Exercise order within the day"),
                          name: z.string().describe("Exercise name in English"),
                          sets: z.number().describe("Number of sets"),
                          reps: z.number().describe("Number of reps"),
                          restTimeInSeconds: z
                            .number()
                            .describe("Rest between sets in seconds"),
                        }),
                      )
                      .optional()
                      .describe("Full exercise list for the day (replaces existing)"),
                  }),
                )
                .describe("Days to update on the plan"),
            }),
            execute: async (input) => {
              const updateWorkoutPlan = new UpdateWorkoutPlan();
              return updateWorkoutPlan.execute({
                userId,
                workoutPlanId: input.workoutPlanId,
                workoutDays: input.workoutDays,
              });
            },
          }),
        },
      });

      result.consumeStream();

      const response = result.toUIMessageStreamResponse({
        originalMessages: messages as UIMessage[],
        onFinish: async ({ messages: allMessages }) => {
          const saveMessages = new SaveMessages();
          await saveMessages.execute({
            conversationId,
            messages: allMessages.map((message) => ({
              id: message.id,
              role: message.role,
              parts: message.parts as Prisma.InputJsonValue,
            })),
          });
        },
      });

      reply.status(response.status);
      reply.header("X-Conversation-Id", conversationId);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body);
    },
  });
};
