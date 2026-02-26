"use client";

import { useMemo, useState, useTransition } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, BrainCircuit, Rocket, Sparkles, Wand2 } from "lucide-react";
import { generateMilestoneBoilerplate } from "./actions";
import type { ArchitectPlan } from "@/lib/gemini";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function HomePage() {
  const [goal, setGoal] = useState("Build a secure fintech dashboard");
  const [plan, setPlan] = useState<ArchitectPlan | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [selectedMilestone, setSelectedMilestone] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isCodePending, startCodeTransition] = useTransition();
  const [generationMode, setGenerationMode] = useState<"gemini" | "fallback" | null>(null);

  const canSubmit = goal.trim().length > 12;

  const handleGeneratePlan = () => {
    setLogs([]);
    setPlan(null);
    setSelectedCode("");
    setSelectedMilestone("");
    setGenerationMode(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/architect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal }),
        });

        if (!response.ok || !response.body) {
          const message = await response.text();
          throw new Error(message || "Failed to create architecture stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }
            const packet = JSON.parse(line) as
              | { type: "log"; message: string }
              | { type: "plan"; payload: ArchitectPlan; mode?: "gemini" | "fallback" }
              | { type: "error"; message: string };

            if (packet.type === "log") {
              setLogs((prev) => [...prev, packet.message]);
            } else if (packet.type === "plan") {
              setPlan(packet.payload);
              setGenerationMode(packet.mode ?? "gemini");
            } else if (packet.type === "error") {
              setLogs((prev) => [...prev, `Error: ${packet.message}`]);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate architecture.";
        setLogs((prev) => [...prev, `Error: ${message}`]);
      }
    });
  };

  const handleBoilerplate = (milestone: string) => {
    setSelectedMilestone(milestone);
    startCodeTransition(async () => {
      try {
        const code = await generateMilestoneBoilerplate(goal, milestone);
        setSelectedCode(code);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate boilerplate.";
        setSelectedCode(`// ${message}`);
      }
    });
  };

  const headingIcon = useMemo(() => <BrainCircuit className="h-6 w-6 text-accent" />, []);

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-4 md:p-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-6">
            <CardHeader className="mb-6 space-y-3">
              <div className="flex items-center gap-3">
                {headingIcon}
                <CardTitle className="text-2xl">AI-Native Project Architect</CardTitle>
              </div>
              <CardDescription>
                Create a production-grade architecture plan powered by Gemini, then generate code by milestone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Project Goal</label>
              <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Describe your product vision..." />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={handleGeneratePlan} disabled={!canSubmit || isPending}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isPending ? "Architecting..." : "Generate AI Architecture"}
                </Button>
                <Badge>Gemini + Cursor + v0 optimized</Badge>
              </div>
            </CardContent>
          </Card>

          {generationMode === "fallback" && (
            <Card className="border-amber-500/40 bg-amber-500/10">
              <CardContent className="pt-5 text-sm text-amber-200">
                Gemini is unavailable right now (key/quota/model). Showing fallback architecture template so you can continue building.
              </CardContent>
            </Card>
          )}

          {plan && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><Rocket className="h-5 w-5 text-primary" />Recommended Tech Stack</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {plan.techStack.map((item) => (
                    <Badge key={item} className="border-primary/40 bg-primary/10 text-primary-foreground">
                      {item}
                    </Badge>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plan.milestones.map((milestone, idx) => (
                  <Card key={milestone + idx} className="h-full">
                    <CardHeader>
                      <CardTitle className="text-base">Milestone {idx + 1}</CardTitle>
                      <CardDescription>{milestone}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button className="w-full" variant="secondary" onClick={() => handleBoilerplate(milestone)}>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Generate Boilerplate
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>AI-Native Shortcuts</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {plan.aiNativeShortcuts.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}

          {selectedMilestone && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Boilerplate · {selectedMilestone}</CardTitle>
                <CardDescription>{isCodePending ? "Generating code..." : "Syntax-highlighted starter code"}</CardDescription>
              </CardHeader>
              <CardContent>
                <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ borderRadius: 12, fontSize: 13 }}>
                  {selectedCode || "// Click a milestone to generate starter code"}
                </SyntaxHighlighter>
              </CardContent>
            </Card>
          )}
        </div>

        <aside>
          <Card className="sticky top-4 h-[calc(100vh-2rem)] min-h-[420px] overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-accent" />Agent Logs</CardTitle>
              <CardDescription>Real-time breakdown of AI architecture reasoning.</CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-5.5rem)] overflow-y-auto pr-1">
              <div className="space-y-3">
                {logs.length === 0 && <p className="text-sm text-muted-foreground">Waiting for your project goal...</p>}
                {logs.map((log, index) => (
                  <div key={`${log}-${index}`} className="rounded-md border border-border/80 bg-secondary/40 p-3 text-sm">
                    {log}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
