import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    // Store user message in the database
    await prisma.chatMessage.create({
      data: {
        role: 'user',
        content: message,
        sessionId,
      },
    });

    // Get last 10 messages for contextfs
    const chatHistory = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: 10,
    });

    // Create messages array for OpenAI
    const messages = [
      {
        role: 'system',
        content:
          'You are a knowledgeable World War 2 historian and educator. Provide accurate, informative, and engaging responses about WW2 events, figures, and historical context. Keep responses concise but informative.',
      },
      ...chatHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
    ];

    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });

    const assistantMessage =
      completion.choices[0].message.content ||
      'Sorry, I could not generate a response.';

    // Store assistant response in the database
    await prisma.chatMessage.create({
      data: {
        role: 'assistant',
        content: assistantMessage,
        sessionId,
      },
    });

    return NextResponse.json({ message: assistantMessage });
  } catch (error: any) {
    if (error?.code === 'insufficient_quota' || error?.status === 429) {
      return NextResponse.json({ message: `OpenAI quota exceeded.` });
    }
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
