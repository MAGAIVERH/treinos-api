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

const SYSTEM_PROMPT = `Você é um personal trainer virtual especialista em montagem de planos de treino personalizados.

## Personalidade
- Tom amigável, motivador e acolhedor.
- Linguagem simples e direta, sem jargões técnicos. Seu público principal são pessoas leigas em musculação.
- Respostas curtas e objetivas.

## Regras de Interação

1. **SEMPRE** chame \`getUserTrainData\` e \`getWorkoutPlans\` (com \`active: true\`) no início de cada conversa, antes de responder ao usuário. Isso é obrigatório.

2. **Usuário retornando (dados cadastrados + plano ativo):**
   - **NÃO** refaça onboarding nem peça peso, altura, idade ou % de gordura novamente.
   - **NÃO** crie ou recrie um plano de treino automaticamente.
   - Cumprimente pelo nome e ofereça ajustes: "Quer alterar algum exercício, trocar um dia ou criar um plano novo?"
   - Só prossiga para criação ou alteração quando o usuário pedir explicitamente.

3. **Usuário sem dados cadastrados (\`getUserTrainData\` retorna null):**
   - Pergunte peso (kg), altura (cm), idade e % de gordura corporal (inteiro de 0 a 100, onde 100 = 100%).
   - Faça perguntas simples e diretas, tudo em uma única mensagem.
   - Após receber os dados, salve com a tool \`updateUserTrainData\`. **IMPORTANTE**: converta o peso de kg para gramas (multiplique por 1000) antes de salvar.

4. **Usuário com dados cadastrados, mas sem plano ativo:**
   - Cumprimente pelo nome.
   - Pergunte se ele quer criar um plano de treino. **NÃO** crie automaticamente.

5. **Criação de plano de treino:**
   - **SOMENTE** quando o usuário pedir explicitamente (ex: "monte meu treino", "criar plano novo", "quero um plano").
   - Pergunte objetivo, dias disponíveis e restrições físicas antes de montar.
   - O plano DEVE ter exatamente 7 dias (MONDAY a SUNDAY).
   - Dias sem treino devem ter: \`isRestDay: true\`, \`exercises: []\`, \`estimatedDurationInSeconds: 0\`.
   - Chame \`createWorkoutPlan\` para salvar (isso desativa o plano anterior do usuário).

6. **Ajustes pontuais no plano existente:**
   - Quando o usuário quiser alterar exercício, trocar um dia ou ajustar séries/reps.
   - Use \`getWorkoutPlans\` com \`active: true\` para obter os IDs dos dias (\`workoutDayId\`).
   - Use \`updateWorkoutPlan\` para aplicar ajustes sem recriar o plano inteiro.
   - Para um plano completamente novo, use \`createWorkoutPlan\`.

### Divisões de Treino (Splits)

Escolha a divisão adequada com base nos dias disponíveis:
- **2-3 dias/semana**: Full Body ou ABC (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas+Ombros)
- **4 dias/semana**: Upper/Lower (recomendado, cada grupo 2x/semana) ou ABCD (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas, D: Ombros+Abdômen)
- **5 dias/semana**: PPLUL — Push/Pull/Legs + Upper/Lower (superior 3x, inferior 2x/semana)
- **6 dias/semana**: PPL 2x — Push/Pull/Legs repetido

### Princípios Gerais de Montagem
- Músculos sinérgicos juntos (peito+tríceps, costas+bíceps)
- Exercícios compostos primeiro, isoladores depois
- 4 a 8 exercícios por sessão
- 3-4 séries por exercício. 8-12 reps (hipertrofia), 4-6 reps (força)
- Descanso entre séries: 60-90s (hipertrofia), 2-3min (compostos pesados)
- Evitar treinar o mesmo grupo muscular em dias consecutivos
- Nomes descritivos para cada dia (ex: "Superior A - Peito e Costas", "Descanso")
- Informe após finalizar a criação ou alteração do treino com sucesso para o usuário clicar no botão no canto superior direito (ACESSAR FIT.AI) para visualizar seu treino.

### Imagens de Capa (coverImageUrl)

SEMPRE forneça um \`coverImageUrl\` para cada dia de treino. Escolha com base no foco muscular:

**Dias majoritariamente superiores** (peito, costas, ombros, bíceps, tríceps, push, pull, upper, full body):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL

**Dias majoritariamente inferiores** (pernas, glúteos, quadríceps, posterior, panturrilha, legs, lower):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY

Alterne entre as duas opções de cada categoria para variar. Dias de descanso usam imagem de superior.`;

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
              "Busca os dados de treino do usuário autenticado (peso, altura, idade, % gordura). Retorna null se não houver dados cadastrados.",
            inputSchema: z.object({}),
            execute: async () => {
              const getUserTrainData = new GetUserTrainData();
              return getUserTrainData.execute({ userId });
            },
          }),
          updateUserTrainData: tool({
            description:
              "Atualiza os dados de treino do usuário autenticado. O peso deve ser em gramas (converter kg * 1000).",
            inputSchema: z.object({
              weightInGrams: z.number().describe("Peso do usuário em gramas (ex: 70kg = 70000)"),
              heightInCentimeters: z.number().describe("Altura do usuário em centímetros"),
              age: z.number().describe("Idade do usuário"),
              bodyFatPercentage: z
                .number()
                .int()
                .min(0)
                .max(100)
                .describe("Percentual de gordura corporal (0 a 100)"),
            }),
            execute: async (params) => {
              const upsertUserTrainData = new UpsertUserTrainData();
              return upsertUserTrainData.execute({ userId, ...params });
            },
          }),
          getWorkoutPlans: tool({
            description:
              "Lista planos de treino do usuário autenticado. Use active: true para verificar se há plano ativo no início da conversa.",
            inputSchema: z.object({
              active: z
                .boolean()
                .optional()
                .describe("Filtrar apenas o plano ativo (true) ou todos os planos"),
            }),
            execute: async ({ active }) => {
              const listWorkoutPlans = new ListWorkoutPlans();
              return listWorkoutPlans.execute({ userId, active });
            },
          }),
          createWorkoutPlan: tool({
            description:
              "Cria um novo plano de treino completo para o usuário. Use SOMENTE quando o usuário pedir explicitamente um plano novo. Desativa o plano ativo anterior do usuário.",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z
                .array(
                  z.object({
                    name: z.string().describe("Nome do dia (ex: Peito e Tríceps, Descanso)"),
                    weekDay: z.enum(WeekDay).describe("Dia da semana"),
                    isRest: z.boolean().describe("Se é dia de descanso (true) ou treino (false)"),
                    estimatedDurationInSeconds: z
                      .number()
                      .describe("Duração estimada em segundos (0 para dias de descanso)"),
                    coverImageUrl: z
                      .string()
                      .url()
                      .describe(
                        "URL da imagem de capa do dia de treino. Usar as URLs de superior ou inferior conforme o foco muscular do dia.",
                      ),
                    exercises: z
                      .array(
                        z.object({
                          order: z.number().describe("Ordem do exercício no dia"),
                          name: z.string().describe("Nome do exercício"),
                          sets: z.number().describe("Número de séries"),
                          reps: z.number().describe("Número de repetições"),
                          restTimeInSeconds: z
                            .number()
                            .describe("Tempo de descanso entre séries em segundos"),
                        }),
                      )
                      .describe("Lista de exercícios (vazia para dias de descanso)"),
                  }),
                )
                .describe("Array com exatamente 7 dias de treino (MONDAY a SUNDAY)"),
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
              "Atualiza dias específicos do plano ativo sem recriar o plano inteiro. Use para ajustes pontuais (trocar exercício, alterar séries/reps, renomear dia).",
            inputSchema: z.object({
              workoutPlanId: z
                .string()
                .uuid()
                .optional()
                .describe("ID do plano (opcional; usa o plano ativo se omitido)"),
              workoutDays: z
                .array(
                  z.object({
                    workoutDayId: z.string().uuid().describe("ID do dia de treino a atualizar"),
                    name: z.string().optional().describe("Novo nome do dia"),
                    isRest: z.boolean().optional().describe("Se é dia de descanso"),
                    estimatedDurationInSeconds: z
                      .number()
                      .optional()
                      .describe("Duração estimada em segundos"),
                    coverImageUrl: z.string().url().optional().describe("URL da imagem de capa"),
                    exercises: z
                      .array(
                        z.object({
                          order: z.number().describe("Ordem do exercício no dia"),
                          name: z.string().describe("Nome do exercício"),
                          sets: z.number().describe("Número de séries"),
                          reps: z.number().describe("Número de repetições"),
                          restTimeInSeconds: z
                            .number()
                            .describe("Tempo de descanso entre séries em segundos"),
                        }),
                      )
                      .optional()
                      .describe("Lista completa de exercícios do dia (substitui os existentes)"),
                  }),
                )
                .describe("Dias a atualizar no plano"),
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
