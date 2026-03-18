import { NextRequest } from "next/server";
import {
  runSearch,
  runNetwork,
  runCulture,
  runReport,
  parseJson,
} from "@/lib/anthropic";
import { AnalysisInput, AnalysisResult } from "@/lib/types";

export const maxDuration = 300; // per invocation — each step gets its own 300s

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      const keepAlive = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      function cleanup() {
        clearInterval(keepAlive);
        closed = true;
        controller.close();
      }

      try {
        const body = await req.json();
        const step: string = body.step;
        const input: AnalysisInput = body.input;

        if (!input?.name?.trim()) {
          send("error", { error: "Name is required" });
          cleanup();
          return;
        }

        if (!["hire", "customer", "employer"].includes(input.mode)) {
          send("error", { error: "Invalid analysis mode" });
          cleanup();
          return;
        }

        const callbacks = {
          onText: (text: string) => send("thinking", { text }),
        };

        if (step === "search") {
          const findings = await runSearch(input, {
            ...callbacks,
            onToolUse: () => send("thinking", { text: "" }),
          });
          send("done", { result: findings });
        } else if (step === "network") {
          const findings: string = body.searchFindings;
          if (!findings) {
            send("error", { error: "searchFindings is required for network step" });
            cleanup();
            return;
          }
          const networkJson = await runNetwork(input, findings, callbacks);
          send("done", { result: networkJson });
        } else if (step === "culture") {
          const findings: string = body.searchFindings;
          if (!findings) {
            send("error", { error: "searchFindings is required for culture step" });
            cleanup();
            return;
          }
          const culturalJson = await runCulture(input, findings, callbacks);
          send("done", { result: culturalJson });
        } else if (step === "report") {
          const { searchFindings, networkJson, culturalJson } = body;
          if (!searchFindings || !networkJson || !culturalJson) {
            send("error", { error: "All prior results required for report step" });
            cleanup();
            return;
          }
          const report = await runReport(input, searchFindings, networkJson, culturalJson, callbacks);

          // Assemble final result
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const networkData: any = parseJson(networkJson, "network");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const culturalData: any = parseJson(culturalJson, "cultural");

          const result: AnalysisResult = {
            target: networkData.target,
            network: networkData.network,
            structure_metrics: networkData.structure_metrics,
            cultural_signals: culturalData.cultural_signals,
            risk_flags: culturalData.risk_flags || [],
            recommendations: culturalData.recommendations || [],
            data_limitations: culturalData.data_limitations || [],
            report_markdown: report.trim(),
          };

          send("done", { result });
        } else {
          send("error", { error: `Unknown step: ${step}` });
        }

        cleanup();
      } catch (error) {
        console.error("Analysis error:", error);
        const message =
          error instanceof Error ? error.message : "Analysis failed";
        send("error", { error: message });
        cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
