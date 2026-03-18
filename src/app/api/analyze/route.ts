import { NextRequest } from "next/server";
import { runAnalysis } from "@/lib/anthropic";
import { AnalysisInput } from "@/lib/types";

export const maxDuration = 300;

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

      // Send keep-alive pings every 15s to prevent proxy/connection timeouts
      const keepAlive = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      try {
        const input: AnalysisInput = await req.json();

        if (!input.name?.trim()) {
          send("error", { error: "Name is required" });
          clearInterval(keepAlive);
          closed = true;
          controller.close();
          return;
        }

        if (!["hire", "customer", "employer"].includes(input.mode)) {
          send("error", { error: "Invalid analysis mode" });
          clearInterval(keepAlive);
          closed = true;
          controller.close();
          return;
        }

        const result = await runAnalysis(input, {
          onStageChange: (stage) => {
            send("stage", { stage });
          },
          onThinking: (stage, text) => {
            send("thinking", { stage, text });
          },
        });

        send("result", result);
        clearInterval(keepAlive);
        closed = true;
        controller.close();
      } catch (error) {
        console.error("Analysis error:", error);
        const message =
          error instanceof Error ? error.message : "Analysis failed";
        send("error", { error: message });
        clearInterval(keepAlive);
        closed = true;
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
