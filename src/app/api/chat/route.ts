import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

// Create a Prisma client instance to interact with the database
const prisma = new PrismaClient();
// Create an OpenAI client instance
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/chat
 * Expects: { message: string, sessionId: string }
 * Returns: { content: string }
 */
export async function POST(req: Request) {
  try {
    // Parse the message and sessionId from the request body
    const { message, sessionId } = await req.json();

    // 1. Save the user's message to the database
    await prisma.chatMessage.create({
      data: { role: 'user', content: message, sessionId },
    });

    // 2. Fetch the last 10 messages for context
    const context = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: 10,
    });

    // 3. Build the prompt for OpenAI (system prompt + context)
    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      {
        role: 'system',
        content: 'You are a knowledgeable World War 2 historian and educator. Provide accurate, informative, and engaging responses about WW2 events, figures, and historical context. Keep responses concise but informative.',
      },
      ...context.map(({ role, content }) => ({
        role: role === 'user' || role === 'assistant' || role === 'system' ? (role as 'user' | 'assistant' | 'system') : 'user',
        content,
      })),
    ];

    // 4. Call OpenAI GPT-4o-mini for a response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });

    // 5. Save the assistant's response to the database
    const aiResponse = completion.choices[0].message.content ?? 'Sorry, I could not generate a response.';
    await prisma.chatMessage.create({
      data: { role: 'assistant', content: aiResponse, sessionId },
    });

    // 6. Return the response to the frontend
    return NextResponse.json({ content: aiResponse });
  } catch (error) {
    // Log and return an error if something goes wrong
    console.error('Failed to process chat message:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}