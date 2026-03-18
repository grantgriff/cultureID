"use client";

import { useState, useEffect, useRef } from "react";
import { AnalysisStage } from "@/lib/types";

interface LoadingStateProps {
  stage: AnalysisStage;
  thinkingLog: Record<string, string[]>;
}

const STAGES: { key: AnalysisStage; label: string }[] = [
  { key: "searching", label: "Searching public sources..." },
  { key: "mapping", label: "Mapping connections..." },
  { key: "analyzing", label: "Analyzing cultural signals..." },
  { key: "generating", label: "Generating visualization..." },
];

const VISIBLE_LINES = 3;

function ThinkingStream({
  lines,
  isActive,
}: {
  lines: string[];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current && expanded) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines.length, expanded]);

  if (lines.length === 0) return null;

  const recentLines = lines.slice(-VISIBLE_LINES);
  const hasMore = lines.length > VISIBLE_LINES;

  return (
    <div className="mt-1.5 ml-8 overflow-hidden">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-left group"
        >
          <div className="space-y-0.5">
            {recentLines.map((line, i) => (
              <p
                key={`${lines.length}-${i}`}
                className={`text-xs font-mono truncate transition-opacity duration-300 ${
                  isActive
                    ? i === recentLines.length - 1
                      ? "text-gray-500/70"
                      : i === recentLines.length - 2
                        ? "text-gray-600/50"
                        : "text-gray-700/30"
                    : "text-gray-700/20"
                }`}
              >
                {line}
              </p>
            ))}
          </div>
          {hasMore && (
            <p className="text-[10px] text-gray-600/40 mt-1 group-hover:text-gray-500/60 transition-colors">
              {lines.length} lines — click to expand
            </p>
          )}
        </button>
      ) : (
        <div>
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-gray-600/40 hover:text-gray-500/60 transition-colors mb-1"
          >
            collapse
          </button>
          <div className="max-h-48 overflow-y-auto rounded bg-gray-900/50 p-2 border border-gray-800/50">
            {lines.map((line, i) => (
              <p
                key={i}
                className="text-xs font-mono text-gray-600/50 leading-relaxed"
              >
                {line}
              </p>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoadingState({ stage, thinkingLog }: LoadingStateProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-8">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-gray-700 rounded-full" />
        <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin" />
      </div>

      <div className="space-y-3 w-full max-w-md">
        {STAGES.map((s, i) => {
          const isActive = s.key === stage;
          const isDone = i < currentIndex;
          const lines = thinkingLog[s.key] || [];

          return (
            <div key={s.key}>
              <div
                className={`flex items-center gap-3 text-sm transition-colors ${
                  isActive
                    ? "text-indigo-400"
                    : isDone
                      ? "text-green-400"
                      : "text-gray-600"
                }`}
              >
                <span className="w-5 text-center">
                  {isDone ? "✓" : isActive ? "●" : "○"}
                </span>
                <span>{s.label}</span>
              </div>
              {(isActive || isDone) && lines.length > 0 && (
                <ThinkingStream lines={lines} isActive={isActive} />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-gray-500 text-xs">
        This may take up to 5 minutes...
      </p>
    </div>
  );
}
