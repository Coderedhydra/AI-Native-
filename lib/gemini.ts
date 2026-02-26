export type ArchitectPlan = {
  techStack: string[];
  milestones: string[];
  aiNativeShortcuts: string[];
};

const MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-flash"];
const MISSING_KEY_MESSAGE =
  "Missing Gemini API key. Set GEMINI_API_KEY or GEMINI_API_KEYS (comma-separated).";
const EMBEDDED_FALLBACK_KEYS = [
  "AIzaSyBbe1Xg3Nu_GtSCRQqi7LUAHqjHbxMdMNI",
  "AIzaSyDL2mfCJPXWUPwhgBDWLuBg4T1eFcocdjc",
];

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const CIRCUIT_BREAKER_THRESHOLD = 4;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000;

type GenerationOptions = { maxOutputTokens?: number };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiRequestFailure = {
  status: number;
  message: string;
};

const circuitBreakerState = {
  failures: 0,
  openedUntil: 0,
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function circuitBreakerOpen() {
  return Date.now() < circuitBreakerState.openedUntil;
}

function recordFailure() {
  circuitBreakerState.failures += 1;
  if (circuitBreakerState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerState.openedUntil = Date.now() + CIRCUIT_BREAKER_WINDOW_MS;
    circuitBreakerState.failures = 0;
  }
}

function recordSuccess() {
  circuitBreakerState.failures = 0;
  circuitBreakerState.openedUntil = 0;
}

function getApiKeys() {
  const csv = process.env.GEMINI_API_KEYS?.trim();
  const single = process.env.GEMINI_API_KEY?.trim();

  const keys = [
    ...(csv ? csv.split(",").map((item) => item.trim()) : []),
    ...(single ? [single] : []),
    ...EMBEDDED_FALLBACK_KEYS,
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error(MISSING_KEY_MESSAGE);
  }

  return Array.from(new Set(keys));
}

function summarizeErrorPayload(payloadText: string) {
  const condensed = payloadText.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 220);
}

async function requestWithKey(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: GenerationOptions,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: {
          role: "system",
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: options?.maxOutputTokens ?? 700,
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw {
      status: response.status,
      message: `model=${model} status=${response.status} ${summarizeErrorPayload(details)}`,
    } satisfies GeminiRequestFailure;
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();

  if (!text) {
    throw { status: 500, message: "Gemini returned an empty response." } satisfies GeminiRequestFailure;
  }

  return text;
}

async function requestWithBackoff(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: GenerationOptions,
) {
  let lastError: GeminiRequestFailure | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await requestWithKey(model, apiKey, systemPrompt, userPrompt, options);
    } catch (error) {
      if (!isFailure(error)) {
        throw error;
      }
      lastError = error;
      if (error.status !== 429 || attempt === RETRY_DELAYS_MS.length) {
        break;
      }
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError ?? { status: 500, message: "Unknown Gemini request failure." };
}

async function listGenerateContentModels(apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return [] as string[];
  }

  const payload = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };

  return (
    payload.models
      ?.filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => model.name?.replace("models/", ""))
      .filter((name): name is string => Boolean(name)) ?? []
  );
}

function isFailure(error: unknown): error is GeminiRequestFailure {
  return Boolean(error && typeof error === "object" && "status" in error && "message" in error);
}

async function geminiGenerate(systemPrompt: string, userPrompt: string, options?: GenerationOptions) {
  if (circuitBreakerOpen()) {
    throw new Error("Gemini temporarily disabled by circuit breaker due to repeated failures.");
  }

  const keys = getApiKeys();
  const errors: string[] = [];
  const blockedKeys = new Set<number>();
  let candidateModels = [...MODELS];

  for (let i = 0; i < keys.length; i += 1) {
    const discovered = await listGenerateContentModels(keys[i]);
    if (discovered.length > 0) {
      candidateModels = Array.from(new Set([...discovered, ...MODELS]));
      break;
    }
  }

  for (const model of candidateModels) {
    for (let i = 0; i < keys.length; i += 1) {
      if (blockedKeys.has(i)) {
        continue;
      }

      try {
        const text = await requestWithBackoff(model, keys[i], systemPrompt, userPrompt, options);
        recordSuccess();
        return text;
      } catch (error) {
        if (isFailure(error)) {
          errors.push(`key#${i + 1}: ${error.message}`);
          if (error.status === 403 || error.status === 429) {
            blockedKeys.add(i);
          }
        } else if (error instanceof Error) {
          errors.push(`key#${i + 1}: ${error.message}`);
        } else {
          errors.push(`key#${i + 1}: unknown Gemini error`);
        }
      }
    }
  }

  recordFailure();
  throw new Error(
    `Gemini unavailable after model/key failover. ${errors.slice(0, 4).join(" | ")} ${errors.length > 4 ? "..." : ""}`,
  );
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
  return `# Fallback starter (Gemini unavailable)\n\nMilestone: ${milestone}\n\n\`\`\`ts\n// app/(dashboard)/${milestone
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}/page.tsx\nexport default function MilestonePage() {\n  return (\n    <section className=\"p-6\">\n      <h1 className=\"text-xl font-semibold\">${milestone}</h1>\n      <p className=\"text-sm text-muted-foreground mt-2\">\n        Replace this fallback with Gemini-generated implementation once API is healthy.\n      </p>\n    </section>\n  );\n}\n\`\`\``;
}

export async function generateArchitecturePlan(goal: string): Promise<ArchitectPlan> {
  const systemPrompt =
    "You are a Senior AI Solutions Architect specialized in rapid prototyping. Output ONLY strict JSON with keys techStack (string[]), milestones (string[5]), aiNativeShortcuts (string[3]). Keep it concise.";

  const raw = await geminiGenerate(systemPrompt, `Project Goal: ${goal}`, { maxOutputTokens: 600 });
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
    "You are a Senior AI Solutions Architect. Return concise starter code with filenames and fenced code blocks.";

  return geminiGenerate(
    systemPrompt,
    `Project goal: ${goal}\nMilestone: ${milestone}\nReturn practical starter code only.`,
    { maxOutputTokens: 1200 },
  );
}
