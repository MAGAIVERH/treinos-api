import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";

interface MessageInputDto {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Prisma.InputJsonValue;
}

interface InputDto {
  conversationId: string;
  messages: MessageInputDto[];
}

export class SaveMessages {
  async execute(dto: InputDto): Promise<void> {
    const existingMessages = await prisma.message.findMany({
      where: { conversationId: dto.conversationId },
      select: { id: true },
    });
    const existingIds = new Set(existingMessages.map((message) => message.id));

    const newMessages = dto.messages.filter((message) => !existingIds.has(message.id));
    if (newMessages.length === 0) {
      return;
    }

    await prisma.$transaction([
      prisma.message.createMany({
        data: newMessages.map((message) => ({
          id: message.id,
          conversationId: dto.conversationId,
          role: message.role,
          content: message.parts,
        })),
      }),
      prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }
}
