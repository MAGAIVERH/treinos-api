import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

// PrismaNeon aceita PoolConfig diretamente, não uma instância de Pool
const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
