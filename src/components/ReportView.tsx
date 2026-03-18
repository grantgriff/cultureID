"use client";

import { AnalysisResult } from "@/lib/types";

interface ReportViewProps {
  data: AnalysisResult;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{score}/5</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all bg-indigo-500"
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function ReportView({ data }: ReportViewProps) {
  const { target, structure_metrics, cultural_signals, risk_flags, recommendations, data_limitations, report_markdown } = data;

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">{target.name}</h2>
        <p className="text-gray-400">
          {target.title}
          {target.company ? ` @ ${target.company}` : ""}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {data.network.nodes.length}
          </div>
          <div className="text-gray-400 text-xs">Connections</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white capitalize">
            {structure_metrics.density}
          </div>
          <div className="text-gray-400 text-xs">Density</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white capitalize">
            {structure_metrics.centralization.replace("_", " ")}
          </div>
          <div className="text-gray-400 text-xs">Centralization</div>
        </div>
      </div>

      {/* Cultural Signals */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="text-white font-semibold">Cultural Signals</h3>
        <ScoreBar
          score={cultural_signals.pace_intensity.score}
          label="Pace & Intensity"
        />
        <ScoreBar
          score={cultural_signals.collaboration.score}
          label="Collaboration"
        />
        <ScoreBar
          score={cultural_signals.work_life.score}
          label="Work-Life Balance"
        />

        {cultural_signals.values_detected.length > 0 && (
          <div className="pt-2">
            <div className="text-gray-400 text-xs mb-1">Values Detected</div>
            <div className="flex flex-wrap gap-1">
              {cultural_signals.values_detected.map((v, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Risk Flags */}
      {risk_flags.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <h3 className="text-white font-semibold">Risk Flags</h3>
          {risk_flags.map((flag, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm p-2 rounded ${
                flag.severity === "high"
                  ? "bg-red-500/10 text-red-400"
                  : flag.severity === "medium"
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-gray-700/50 text-gray-300"
              }`}
            >
              <span className="font-medium shrink-0">
                {flag.severity === "high"
                  ? "!!"
                  : flag.severity === "medium"
                    ? "!"
                    : "~"}
              </span>
              <div>
                <div className="font-medium">{flag.flag}</div>
                <div className="text-xs opacity-75">{flag.evidence}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <h3 className="text-white font-semibold">Recommendations</h3>
          <ul className="space-y-1">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-gray-300 text-sm flex gap-2">
                <span className="text-indigo-400 shrink-0">-</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Limitations */}
      {data_limitations.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wide mb-2">
            Data Limitations
          </h3>
          <ul className="space-y-1">
            {data_limitations.map((lim, i) => (
              <li key={i} className="text-gray-500 text-xs">
                {lim}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Markdown Report (collapsible) */}
      <details className="bg-gray-800 rounded-lg border border-gray-700">
        <summary className="px-4 py-3 cursor-pointer text-gray-300 font-medium hover:text-white transition-colors">
          Full Report (Markdown)
        </summary>
        <div className="px-4 pb-4">
          <pre className="whitespace-pre-wrap text-gray-400 text-xs leading-relaxed font-mono">
            {report_markdown}
          </pre>
        </div>
      </details>
    </div>
  );
}
