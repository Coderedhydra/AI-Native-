"use server";

import { generateMilestoneStarter } from "@/lib/gemini";

export async function generateMilestoneBoilerplate(goal: string, milestone: string) {
  return generateMilestoneStarter(goal, milestone);
}
