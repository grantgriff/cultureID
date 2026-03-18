import { NextRequest } from "next/server";
import { runAnalysis } from "@/lib/anthropic";
import { AnalysisInput } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const input: AnalysisInput = await req.json();

        if (!input.name?.trim()) {
          send("error", { error: "Name is required" });
          controller.close();
          return;
        }

        if (!["hire", "customer", "employer"].includes(input.mode)) {
          send("error", { error: "Invalid analysis mode" });
          controller.close();
          return;
        }

        const result = await runAnalysis(input, (stage) => {
          send("stage", { stage });
        });

        send("result", result);
        controller.close();
      } catch (error) {
        console.error("Analysis error:", error);
        const message =
          error instanceof Error ? error.message : "Analysis failed";
        send("error", { error: message });
        controller.close();
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
