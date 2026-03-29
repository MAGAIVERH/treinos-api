import "dotenv/config";

import type { IncomingMessage, ServerResponse } from "node:http";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import Fastify from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import z from "zod";

import { env } from "./lib/env.js";
import { aiRoutes } from "./routes/ai.js";
import { homeRoutes } from "./routes/home.js";
import { meRoutes } from "./routes/me.js";
import { statsRoutes } from "./routes/stats.js";
import { workoutPlanRoutes } from "./routes/workout-plan.js";

const app = Fastify({
  logger: env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos API",
      description: "API para o bootcamp de treinos do FSC",
      version: "1.0.0",
    },
    servers: [
      {
        description: "API base URL",
        url: env.API_BASE_URL,
      },
    ],
  },
  transform: jsonSchemaTransform,
});

await app.register(fastifyCors, {
  origin: [env.WEB_APP_BASE_URL],
  credentials: true,
});

await app.register(homeRoutes, { prefix: "/home" });
await app.register(meRoutes, { prefix: "/me" });
await app.register(statsRoutes, { prefix: "/stats" });
await app.register(workoutPlanRoutes, { prefix: "/workout-plans" });
await app.register(aiRoutes, { prefix: "/ai" });

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  schema: { hide: true },
  handler: async () => app.swagger(),
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello world",
    tags: ["Hello World"],
    response: {
      200: z.object({ message: z.string() }),
    },
  },
  handler: () => ({ message: "Hello World" }),
});

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  schema: { hide: true },
  async handler(request, reply) {
    try {
      const { auth } = await import("./lib/auth.js");

      const url = new URL(request.url, `https://${request.headers.host}`);

      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.append(key, value);
          }
        }
      });

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      // ← logs aqui, depois de response estar declarado
      console.log("AUTH RESPONSE STATUS:", response.status);
      console.log("AUTH RESPONSE HEADERS:", Object.fromEntries(response.headers.entries()));

      reply.status(response.status);

      const setCookieValues: string[] = [];
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          setCookieValues.push(value);
        } else {
          reply.header(key, value);
        }
      });

      if (setCookieValues.length > 0) {
        reply.header("set-cookie", setCookieValues);
      }

      console.log("SET-COOKIE HEADERS:", setCookieValues);

      const responseText = await response.text();

      console.log("AUTH RESPONSE BODY:", responseText);

      reply.send(responseText || null);
    } catch (error) {
      app.log.error(error);
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

await app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  app.server.emit("request", req, res);
}
