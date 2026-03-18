import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/lib/anthropic";
import { AnalysisInput } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const input: AnalysisInput = await req.json();

    if (!input.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!["hire", "customer", "employer"].includes(input.mode)) {
      return NextResponse.json(
        { error: "Invalid analysis mode" },
        { status: 400 }
      );
    }

    // For MVP, we run the full analysis and return the result
    // A streaming approach would be better for UX but adds complexity
    const result = await runAnalysis(input, (stage) => {
      // In MVP, stage changes aren't streamed to client
      console.log(`Analysis stage: ${stage}`);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis error:", error);
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
