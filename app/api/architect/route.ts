import { NextResponse } from "next/server";
import {
  buildFallbackArchitecturePlan,
  generateArchitecturePlan,
  isMissingKeyError,
} from "@/lib/gemini";

const breakdownStages = [
  "Analyzing product scope and constraints...",
  "Evaluating security, compliance, and scalability posture...",
  "Selecting implementation stack for fastest validated delivery...",
  "Sequencing 5 milestone plan with minimal risk...",
  "Designing AI-native shortcuts for Cursor and v0 acceleration...",
];

export async function POST(request: Request) {
  const { goal } = (await request.json()) as { goal?: string };

  if (!goal || goal.trim().length < 12) {
    return NextResponse.json({ error: "Project goal must be at least 12 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const stage of breakdownStages) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "log", message: stage })}\n`));
          await new Promise((resolve) => setTimeout(resolve, 450));
        }

        const plan = await generateArchitecturePlan(goal);
        const mode: "gemini" | "fallback" = "gemini";

        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "log", message: "Architecture finalized and validated." })}\n`),
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "plan", payload: plan, mode })}\n`));
      } catch (error) {
        const plan = buildFallbackArchitecturePlan(goal);
        const message = isMissingKeyError(error)
          ? "Gemini key missing. Using built-in fallback architecture template."
          : "Gemini unavailable (quota/model/access). Using built-in fallback architecture template.";

        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "log", message })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "plan", payload: plan, mode: "fallback" })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
