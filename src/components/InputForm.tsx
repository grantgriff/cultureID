"use client";

import { useState } from "react";
import { AnalysisInput, AnalysisMode } from "@/lib/types";

interface InputFormProps {
  onSubmit: (input: AnalysisInput) => void;
  isLoading: boolean;
}

const MODE_OPTIONS: { value: AnalysisMode; label: string; desc: string }[] = [
  {
    value: "hire",
    label: "Potential Hire",
    desc: "Assess cultural fit for your team",
  },
  {
    value: "customer",
    label: "Potential Customer",
    desc: "Assess org culture for successful implementation",
  },
  {
    value: "employer",
    label: "Potential Employer",
    desc: "De-risk your career move",
  },
];

export default function InputForm({ onSubmit, isLoading }: InputFormProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("hire");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      mode,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Name <span className="text-red-400">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          required
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="company"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Company <span className="text-gray-600">(optional)</span>
          </label>
          <input
            id="company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Title <span className="text-gray-600">(optional)</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. VP Engineering"
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Analysis Mode
        </label>
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                mode === opt.value
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="mt-0.5 mr-3 text-indigo-500 focus:ring-indigo-500"
              />
              <div>
                <div className="text-white font-medium text-sm">
                  {opt.label}
                </div>
                <div className="text-gray-400 text-xs">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading || !name.trim()}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
      >
        {isLoading ? "Analyzing..." : "Run Analysis"}
      </button>
    </form>
  );
}
