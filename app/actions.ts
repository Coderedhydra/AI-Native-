"use server";

import {
  buildFallbackMilestoneStarter,
  generateMilestoneStarter,
  isMissingKeyError,
} from "@/lib/gemini";

export async function generateMilestoneBoilerplate(goal: string, milestone: string) {
  try {
    return await generateMilestoneStarter(goal, milestone);
  } catch (error) {
    if (isMissingKeyError(error)) {
      return buildFallbackMilestoneStarter(milestone);
    }

    return `${buildFallbackMilestoneStarter(milestone)}\n\n---\nFallback reason: Gemini unavailable (quota/model/access).`;
  }
}
