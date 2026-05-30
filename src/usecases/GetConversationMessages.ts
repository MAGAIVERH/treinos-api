import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

interface OutputMessageDto {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<Record<string, unknown>>;
}

interface OutputDto {
  conversationId: string | null;
  messages: OutputMessageDto[];
}

export class GetConversationMessages {
  async execute(dto: InputDto): Promise<OutputDto> {
    const conversation = await prisma.conversation.findFirst({
      where: { userId: dto.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return { conversationId: null, messages: [] };
    }

    return {
      conversationId: conversation.id,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role as OutputMessageDto["role"],
        parts: message.content as Array<Record<string, unknown>>,
      })),
    };
  }
}
