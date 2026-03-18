import Anthropic from "@anthropic-ai/sdk";
import { AnalysisInput, AnalysisResult, AnalysisMode } from "./types";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is not set. Add it to your hosting platform's environment variables."
    );
  }
  return new Anthropic({ apiKey });
}

function buildSearchQueries(input: AnalysisInput): string[] {
  const { name, company, title } = input;
  const nameCompany = company ? `${name} ${company}` : name;
  const queries = [
    `${nameCompany} LinkedIn profile`,
    `${nameCompany} Twitter OR X`,
    `${name} speaker conference talk`,
    `${name} podcast interview`,
  ];
  if (company) {
    queries.push(`${company} leadership team`);
    queries.push(`${company} culture glassdoor reviews`);
  }
  queries.push(`${name} co-founder OR co-author OR collaborated with`);
  if (title && /engineer|developer|cto|technical/i.test(title)) {
    queries.push(`${name} GitHub`);
  }
  return queries;
}

function getModeContext(mode: AnalysisMode): string {
  switch (mode) {
    case "hire":
      return `Context: POTENTIAL HIRE assessment.
Focus on: cultural fit, collaboration patterns, pace alignment, reference backchannel opportunities.
Emphasize: Cultural fit indicators, collaboration signals, potential red flags.`;
    case "customer":
      return `Context: POTENTIAL CUSTOMER assessment.
Focus on: decision-making structure, implementation readiness, pace, internal champions and blockers.
Emphasize: Decision-making structure, implementation readiness, stakeholder map.`;
    case "employer":
      return `Context: POTENTIAL EMPLOYER assessment.
Focus on: real culture beyond careers page, power dynamics, leadership style, work-life signals, turnover flags.
Emphasize: Leadership style, pace/intensity signals, employee sentiment patterns.`;
  }
}

const SYSTEM_PROMPT = `You are a culture sensing analyst. Analyze publicly available information about a person to infer:
1. Their professional network structure and key relationships
2. Cultural signals from their public communications
3. Risk flags or alignment indicators based on the user's context

Ground your analysis in social network theory. Be specific and evidence-based.
Never fabricate connections or data — only report what you actually find in search results.`;

const JSON_SCHEMA = `You MUST output valid JSON matching this exact schema (no markdown fencing, just raw JSON):
{
  "target": {
    "name": "string",
    "title": "string",
    "company": "string",
    "profile_url": "string (best URL found, or empty string)"
  },
  "network": {
    "nodes": [
      {
        "id": "string (lowercase, no spaces)",
        "name": "string",
        "company": "string",
        "title": "string",
        "role": "hub | broker | boundary_spanner | gatekeeper | peripheral | isolate",
        "centrality_score": "number 0-1",
        "cluster_id": "string",
        "relationship_to_target": "direct | indirect | inferred"
      }
    ],
    "edges": [
      {
        "source": "node_id",
        "target": "node_id",
        "strength": "strong | moderate | weak | inferred",
        "evidence": "string"
      }
    ],
    "clusters": [
      {
        "id": "string",
        "label": "string (e.g. 'Company X Team', 'Stanford Network')",
        "node_ids": ["string"]
      }
    ]
  },
  "structure_metrics": {
    "density": "sparse | moderate | dense",
    "centralization": "decentralized | moderate | highly_centralized",
    "most_central_node": "node_id",
    "key_brokers": ["node_id"]
  },
  "cultural_signals": {
    "pace_intensity": { "score": "1-5", "evidence": ["string"] },
    "collaboration": { "score": "1-5", "evidence": ["string"] },
    "work_life": { "score": "1-5", "evidence": ["string"] },
    "values_detected": ["string"]
  },
  "risk_flags": [
    { "flag": "string", "severity": "low | medium | high", "evidence": "string" }
  ],
  "recommendations": ["string"],
  "data_limitations": ["string"],
  "report_markdown": "string (full markdown report)"
}

RULES:
- Only include people/connections you found evidence for
- Do not fabricate nodes or edges
- Always include the target person as a node with id "target"
- Every node referenced in edges must exist in nodes array
- Every node must belong to at least one cluster
- report_markdown should include: Executive Summary, Network Structure, Cultural Signals, Risk Flags, Recommendations, and a Methodology Note`;

export interface AnalysisCallbacks {
  onStageChange: (stage: string) => void;
  onThinking: (stage: string, text: string) => void;
}

export async function runAnalysis(
  input: AnalysisInput,
  callbacks: AnalysisCallbacks
): Promise<AnalysisResult> {
  const { onStageChange, onThinking } = callbacks;
  const analysisStart = Date.now();
  const queries = buildSearchQueries(input);
  const modeContext = getModeContext(input.mode);
  const client = getClient();

  // Single combined call: search + analyze in one request
  onStageChange("searching");
  console.log("[analysis] Starting combined search + analysis for", input.name);

  const prompt = `Research and analyze this person for a culture sensing report:

Name: ${input.name}
${input.company ? `Company: ${input.company}` : ""}
${input.title ? `Title: ${input.title}` : ""}

${modeContext}

STEP 1: Search for this person using these queries (use the web_search tool for each):
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

STEP 2: After ALL searches are complete, produce the structured JSON analysis.

${JSON_SCHEMA}`;

  let fullText = "";
  let searchCount = 0;
  let chunks = 0;
  let inJsonOutput = false;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  stream.on("error", (err) => {
    console.error("[analysis] Stream error:", err);
  });

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (
        event.content_block.type === "server_tool_use" &&
        event.content_block.name === "web_search"
      ) {
        searchCount++;
        onThinking("searching", `Running search ${searchCount}...\n`);
      }
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      chunks++;

      // Detect transition from search summary to JSON output
      if (!inJsonOutput && fullText.includes('"target"')) {
        inJsonOutput = true;
        onStageChange("mapping");
        onThinking("mapping", "Building network map...\n");
        console.log(
          "[analysis] JSON output started at",
          Math.round((Date.now() - analysisStart) / 1000),
          "s"
        );
      }

      // Update UI stage based on JSON progress
      if (inJsonOutput) {
        if (fullText.includes('"cultural_signals"')) {
          onStageChange("analyzing");
        }
        if (fullText.includes('"report_markdown"')) {
          onStageChange("generating");
        }
        onThinking("analyzing", event.delta.text);
      } else {
        onThinking("searching", event.delta.text);
      }
    }
  }

  console.log(
    "[analysis] Stream complete:",
    searchCount, "searches,",
    chunks, "chunks,",
    fullText.length, "chars.",
    "Total:", Math.round((Date.now() - analysisStart) / 1000), "s"
  );

  if (!fullText.trim()) {
    throw new Error("Analysis produced no output.");
  }

  // Parse JSON from the response
  onStageChange("generating");
  onThinking("generating", "Parsing results...\n");

  const jsonMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = jsonMatch ? jsonMatch[1].trim() : null;

  if (!jsonStr) {
    // Find first { to last }
    const firstBrace = fullText.indexOf("{");
    const lastBrace = fullText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = fullText.slice(firstBrace, lastBrace + 1);
    }
  }

  if (!jsonStr) {
    console.error("[analysis] No JSON found. First 300 chars:", fullText.slice(0, 300));
    throw new Error("No JSON structure found in response.");
  }

  let result: AnalysisResult;
  try {
    result = JSON.parse(jsonStr);
  } catch {
    console.error("[analysis] JSON parse failed. First 300 chars:", jsonStr.slice(0, 300));
    throw new Error("Failed to parse analysis output as JSON.");
  }

  onThinking("generating", "Done!\n");
  console.log("[analysis] Complete — nodes:", result.network?.nodes?.length);
  onStageChange("complete");
  return result;
}
