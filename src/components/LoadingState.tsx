"use client";

import { AnalysisStage } from "@/lib/types";

interface LoadingStateProps {
  stage: AnalysisStage;
}

const STAGES: { key: AnalysisStage; label: string }[] = [
  { key: "searching", label: "Searching public sources..." },
  { key: "mapping", label: "Mapping connections..." },
  { key: "analyzing", label: "Analyzing cultural signals..." },
  { key: "generating", label: "Generating visualization..." },
];

export default function LoadingState({ stage }: LoadingStateProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-8">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-gray-700 rounded-full" />
        <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin" />
      </div>

      <div className="space-y-3 w-full max-w-xs">
        {STAGES.map((s, i) => {
          const isActive = s.key === stage;
          const isDone = i < currentIndex;
          return (
            <div
              key={s.key}
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
          );
        })}
      </div>

      <p className="text-gray-500 text-xs">
        This may take up to 60 seconds...
      </p>
    </div>
  );
}
