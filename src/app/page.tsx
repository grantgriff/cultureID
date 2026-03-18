"use client";

import { useState, useRef } from "react";
import { AnalysisInput, AnalysisResult, AnalysisStage } from "@/lib/types";
import InputForm from "@/components/InputForm";
import LoadingState from "@/components/LoadingState";
import NetworkGraph from "@/components/NetworkGraph";
import ReportView from "@/components/ReportView";

export default function Home() {
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinkingLog, setThinkingLog] = useState<Record<string, string[]>>({});
  const thinkingBuffer = useRef<Record<string, string>>({});

  const handleSubmit = async (input: AnalysisInput) => {
    setStage("searching");
    setResult(null);
    setError(null);
    setThinkingLog({});
    thinkingBuffer.current = {};

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        throw new Error("Analysis request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === "stage") {
              setStage(data.stage);
            } else if (currentEvent === "thinking") {
              const { stage: tStage, text } = data;
              // Buffer incoming text fragments and split into lines
              if (!thinkingBuffer.current[tStage]) {
                thinkingBuffer.current[tStage] = "";
              }
              thinkingBuffer.current[tStage] += text;

              // Split on newlines, keep the last partial line in the buffer
              const parts = thinkingBuffer.current[tStage].split("\n");
              const completedLines = parts.slice(0, -1).filter((l: string) => l.trim().length > 0);
              thinkingBuffer.current[tStage] = parts[parts.length - 1];

              // Also flush partial line if it's long enough (handles text without newlines)
              const partial = thinkingBuffer.current[tStage];
              if (partial.length > 80) {
                completedLines.push(partial.trimEnd());
                thinkingBuffer.current[tStage] = "";
              }

              if (completedLines.length > 0) {
                setThinkingLog((prev) => ({
                  ...prev,
                  [tStage]: [...(prev[tStage] || []), ...completedLines],
                }));
              }
            } else if (currentEvent === "result") {
              setResult(data as AnalysisResult);
              setStage("complete");
            } else if (currentEvent === "error") {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  };

  const handleReset = () => {
    setStage("idle");
    setResult(null);
    setError(null);
    setThinkingLog({});
    thinkingBuffer.current = {};
  };

  const isLoading = ["searching", "mapping", "analyzing", "generating"].includes(stage);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              CultureID
            </h1>
            <p className="text-gray-500 text-xs">
              AI-powered culture sensing
            </p>
          </div>
          {stage !== "idle" && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
            >
              New Analysis
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Input State */}
        {stage === "idle" && (
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                Culture Sensing
              </h2>
              <p className="text-gray-400 text-sm">
                Analyze publicly available data to surface cultural signals
                about potential customers, employers, or hires.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <InputForm onSubmit={handleSubmit} isLoading={false} />
            </div>
            <p className="text-center text-gray-600 text-xs mt-4">
              Uses only publicly available data. Results should augment, not
              replace, direct engagement.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingState stage={stage} thinkingLog={thinkingLog} />}

        {/* Error State */}
        {stage === "error" && (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="text-red-400 text-lg font-medium mb-2">
              Analysis Failed
            </div>
            <p className="text-gray-400 text-sm mb-4">{error}</p>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {stage === "complete" && result && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Network Graph - Left Panel */}
            <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-medium text-gray-300">
                  Network Map
                </h3>
              </div>
              <div className="h-[600px]">
                <NetworkGraph data={result} />
              </div>
            </div>

            {/* Report - Right Panel */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-medium text-gray-300">
                  Cultural Insights
                </h3>
              </div>
              <div className="p-4 max-h-[600px] overflow-y-auto">
                <ReportView data={result} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
