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

function normalizeRole(role: string): OutputMessageDto["role"] {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }

  return "assistant";
}

function normalizeParts(content: unknown): Array<Record<string, unknown>> {
  if (!content) {
    return [];
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => typeof part === "object" && part !== null && !Array.isArray(part))
      .map((part) => part as Record<string, unknown>);
  }

  if (typeof content === "object") {
    return [content as Record<string, unknown>];
  }

  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  return [];
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
        role: normalizeRole(message.role),
        parts: normalizeParts(message.content),
      })),
    };
  }
}
