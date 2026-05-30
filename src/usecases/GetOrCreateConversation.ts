import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

interface OutputDto {
  conversationId: string;
}

export class GetOrCreateConversation {
  async execute(dto: InputDto): Promise<OutputDto> {
    const existingConversation = await prisma.conversation.findFirst({
      where: { userId: dto.userId },
      orderBy: { updatedAt: "desc" },
    });

    if (existingConversation) {
      return { conversationId: existingConversation.id };
    }

    const conversation = await prisma.conversation.create({
      data: { userId: dto.userId },
    });

    return { conversationId: conversation.id };
  }
}
