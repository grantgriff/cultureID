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

const SYSTEM_PROMPT = `You are a culture sensing analyst. Analyze publicly available information about a person to infer network structure, cultural signals, and risk flags. Be specific and evidence-based. Never fabricate connections or data.`;

export interface AnalysisCallbacks {
  onStageChange: (stage: string) => void;
  onThinking: (stage: string, text: string) => void;
}

/** Helper: stream a Claude call, collect text, send chunks to UI */
async function streamCall(
  client: Anthropic,
  params: {
    system?: string;
    prompt: string;
    max_tokens: number;
    tools?: Anthropic.Messages.Tool[];
  },
  callbacks: {
    onText: (text: string) => void;
    onToolUse?: (name: string) => void;
  }
): Promise<string> {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: params.max_tokens,
    system: params.system || SYSTEM_PROMPT,
    ...(params.tools ? { tools: params.tools } : {}),
    messages: [{ role: "user", content: params.prompt }],
  });

  let text = "";

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (
        event.content_block.type === "server_tool_use" &&
        callbacks.onToolUse
      ) {
        callbacks.onToolUse(event.content_block.name);
      }
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      callbacks.onText(event.delta.text);
    }
  }

  return text;
}

export async function runAnalysis(
  input: AnalysisInput,
  callbacks: AnalysisCallbacks
): Promise<AnalysisResult> {
  const { onStageChange, onThinking } = callbacks;
  const start = Date.now();
  const elapsed = () => Math.round((Date.now() - start) / 1000);
  const queries = buildSearchQueries(input);
  const modeContext = getModeContext(input.mode);
  const client = getClient();

  // ── Call 1: Web search ──────────────────────────────────────────────
  onStageChange("searching");
  console.log("[analysis] Call 1: Web search for", input.name);

  let searchCount = 0;
  const searchFindings = await streamCall(
    client,
    {
      prompt: `Research this person for a culture sensing analysis:

Name: ${input.name}
${input.company ? `Company: ${input.company}` : ""}
${input.title ? `Title: ${input.title}` : ""}

Search using these queries (use web_search for each):
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

After all searches, compile a detailed summary of everything found: people mentioned, cultural signals, company info, team structure, and patterns.`,
      max_tokens: 8000,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
          max_uses: 10,
        } as unknown as Anthropic.Messages.Tool,
      ],
    },
    {
      onText: (text) => onThinking("searching", text),
      onToolUse: () => {
        searchCount++;
        onThinking("searching", `Running search ${searchCount}...\n`);
      },
    }
  );

  console.log("[analysis] Call 1 done:", searchCount, "searches,", searchFindings.length, "chars.", elapsed(), "s");

  if (!searchFindings.trim()) {
    throw new Error("Web search produced no results.");
  }

  // ── Call 2: Identify stakeholders & network ─────────────────────────
  onStageChange("mapping");
  console.log("[analysis] Call 2: Stakeholders + network.", elapsed(), "s");

  const networkJson = await streamCall(
    client,
    {
      prompt: `Based on these research findings, identify the network of people and organizations connected to ${input.name}.

FINDINGS:
${searchFindings}

Output valid JSON (no markdown fencing) with this structure:
{
  "target": { "name": "string", "title": "string", "company": "string", "profile_url": "string or empty" },
  "network": {
    "nodes": [{ "id": "string (lowercase, no spaces)", "name": "string", "company": "string", "title": "string", "role": "hub|broker|boundary_spanner|gatekeeper|peripheral|isolate", "centrality_score": 0.0-1.0, "cluster_id": "string", "relationship_to_target": "direct|indirect|inferred" }],
    "edges": [{ "source": "node_id", "target": "node_id", "strength": "strong|moderate|weak|inferred", "evidence": "string" }],
    "clusters": [{ "id": "string", "label": "string", "node_ids": ["string"] }]
  },
  "structure_metrics": { "density": "sparse|moderate|dense", "centralization": "decentralized|moderate|highly_centralized", "most_central_node": "node_id", "key_brokers": ["node_id"] }
}

RULES: Always include target as node id "target". Every node in edges must exist in nodes. Every node must be in a cluster. Only include people you found evidence for.`,
      max_tokens: 6000,
    },
    {
      onText: (text) => onThinking("mapping", text),
    }
  );

  console.log("[analysis] Call 2 done:", networkJson.length, "chars.", elapsed(), "s");

  // ── Call 3: Cultural signals + risk flags ───────────────────────────
  onStageChange("analyzing");
  console.log("[analysis] Call 3: Cultural signals.", elapsed(), "s");

  const culturalJson = await streamCall(
    client,
    {
      prompt: `Analyze cultural signals for ${input.name} based on these research findings.

${modeContext}

FINDINGS:
${searchFindings}

Output valid JSON (no markdown fencing):
{
  "cultural_signals": {
    "pace_intensity": { "score": 1-5, "evidence": ["string"] },
    "collaboration": { "score": 1-5, "evidence": ["string"] },
    "work_life": { "score": 1-5, "evidence": ["string"] },
    "values_detected": ["string"]
  },
  "risk_flags": [{ "flag": "string", "severity": "low|medium|high", "evidence": "string" }],
  "recommendations": ["string"],
  "data_limitations": ["string"]
}`,
      max_tokens: 4000,
    },
    {
      onText: (text) => onThinking("analyzing", text),
    }
  );

  console.log("[analysis] Call 3 done:", culturalJson.length, "chars.", elapsed(), "s");

  // ── Call 4: Generate markdown report ────────────────────────────────
  onStageChange("generating");
  console.log("[analysis] Call 4: Report generation.", elapsed(), "s");

  const reportMarkdown = await streamCall(
    client,
    {
      prompt: `Generate a culture sensing report in markdown for ${input.name}.

${modeContext}

RESEARCH FINDINGS:
${searchFindings}

NETWORK DATA:
${networkJson}

CULTURAL ANALYSIS:
${culturalJson}

Write a complete markdown report with these sections:
# Culture Sensing Report: ${input.name}
## Context: ${input.mode}

### Executive Summary
### Network Structure
### Cultural Signals
### Risk Flags
### Recommendations
### Methodology Note

Output ONLY the markdown, no JSON wrapping.`,
      max_tokens: 4000,
    },
    {
      onText: (text) => onThinking("generating", text),
    }
  );

  console.log("[analysis] Call 4 done:", reportMarkdown.length, "chars.", elapsed(), "s");

  // ── Assemble final result ───────────────────────────────────────────
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
    report_markdown: reportMarkdown.trim(),
  };

  console.log("[analysis] Complete — nodes:", result.network?.nodes?.length, "Total:", elapsed(), "s");
  onStageChange("complete");
  return result;
}

function parseJson(text: string, label: string): Record<string, unknown> {
  // Try raw first
  try {
    return JSON.parse(text.trim());
  } catch {
    // ignore
  }

  // Try markdown fencing
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }

  // Find first { to last }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      // ignore
    }
  }

  console.error(`[analysis] ${label} JSON parse failed. First 300 chars:`, text.slice(0, 300));
  throw new Error(`Failed to parse ${label} output as JSON.`);
}
