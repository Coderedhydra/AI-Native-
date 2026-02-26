export type ArchitectPlan = {
  techStack: string[];
  milestones: string[];
  aiNativeShortcuts: string[];
};

const MODEL = "gemini-1.5-flash";
const MISSING_KEY_MESSAGE =
  "Missing Gemini API key. Set GEMINI_API_KEY or GEMINI_API_KEYS (comma-separated).";

function getApiKeys() {
  const csv = process.env.GEMINI_API_KEYS?.trim();
  const single = process.env.GEMINI_API_KEY?.trim();

  const keys = [
    ...(csv ? csv.split(",").map((item) => item.trim()) : []),
    ...(single ? [single] : []),
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error(MISSING_KEY_MESSAGE);
  }

  return Array.from(new Set(keys));
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

async function requestWithKey(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: {
          role: "system",
          parts: [{ text: systemPrompt }],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

async function geminiGenerate(systemPrompt: string, userPrompt: string) {
  const keys = getApiKeys();
  const errors: string[] = [];

  for (let i = 0; i < keys.length; i += 1) {
    try {
      return await requestWithKey(keys[i], systemPrompt, userPrompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini error";
      errors.push(`key#${i + 1}: ${message}`);
    }
  }

  throw new Error(`All configured Gemini keys failed. ${errors.join(" | ")}`);
}

export function isMissingKeyError(error: unknown) {
  return error instanceof Error && error.message.includes(MISSING_KEY_MESSAGE);
}

export function buildFallbackArchitecturePlan(goal: string): ArchitectPlan {
  return {
    techStack: [
      "Next.js 14 (App Router)",
      "TypeScript",
      "Tailwind CSS + shadcn/ui",
      "PostgreSQL + Prisma",
      "Redis",
      "NextAuth/Auth.js",
      "OpenTelemetry",
      "Vercel",
    ],
    milestones: [
      `Define domain boundaries and threat model for: ${goal}`,
      "Implement secure auth, RBAC, session hardening, and audit logs",
      "Build fintech dashboard modules with transactional data pipelines",
      "Add compliance controls (PII handling, encryption, retention policies)",
      "Ship observability, SLO alerts, and release automation",
    ],
    aiNativeShortcuts: [
      "Cursor rule: always scaffold feature folders with route, schema, service, and tests",
      "v0 prompt: generate KPI dashboard cards + responsive filters + empty states",
      "Agent task split: one agent for security baseline, one for data layer, one for UI polish",
    ],
  };
}

export function buildFallbackMilestoneStarter(milestone: string) {
  return `# Fallback starter (Gemini key not configured)\n\nMilestone: ${milestone}\n\n\`\`\`ts\n// app/(dashboard)/${milestone
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}/page.tsx\nexport default function MilestonePage() {\n  return (\n    <section className=\"p-6\">\n      <h1 className=\"text-xl font-semibold\">${milestone}</h1>\n      <p className=\"text-sm text-muted-foreground mt-2\">\n        Replace this fallback with Gemini-generated implementation once API keys are configured.\n      </p>\n    </section>\n  );\n}\n\`\`\`\n\n\`\`\`ts\n// lib/${milestone
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}.ts\nexport function executeMilestoneTask() {\n  return \"TODO: implement milestone service logic\";\n}\n\`\`\``;
}

export async function generateArchitecturePlan(goal: string): Promise<ArchitectPlan> {
  const systemPrompt =
    "You are a Senior AI Solutions Architect specializing in ultra-fast prototyping using Cursor and v0. Output ONLY strict JSON with keys: techStack (string[]), milestones (string[5]), aiNativeShortcuts (string[3]).";

  const raw = await geminiGenerate(systemPrompt, `Project Goal: ${goal}`);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as ArchitectPlan;

  if (!Array.isArray(parsed.techStack) || !Array.isArray(parsed.milestones) || !Array.isArray(parsed.aiNativeShortcuts)) {
    throw new Error("Gemini response is missing required arrays.");
  }

  if (parsed.milestones.length < 5 || parsed.aiNativeShortcuts.length < 3) {
    throw new Error("Gemini response did not include the required item counts.");
  }

  return {
    techStack: parsed.techStack.slice(0, 8),
    milestones: parsed.milestones.slice(0, 5),
    aiNativeShortcuts: parsed.aiNativeShortcuts.slice(0, 3),
  };
}

export async function generateMilestoneStarter(goal: string, milestone: string) {
  const systemPrompt =
    "You are a Senior AI Solutions Architect who writes production-minded starter boilerplate. Return concise code with filenames and fenced code blocks.";

  return geminiGenerate(
    systemPrompt,
    `Project goal: ${goal}\nMilestone: ${milestone}\nReturn practical boilerplate code and setup notes.`,
  );
}
