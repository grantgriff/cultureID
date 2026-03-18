import Anthropic from "@anthropic-ai/sdk";
import { AnalysisInput, AnalysisMode } from "./types";

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

export interface StepCallbacks {
  onText: (text: string) => void;
  onToolUse?: (name: string) => void;
}

/** Stream a Claude call, collect text, send chunks to caller */
async function streamCall(
  client: Anthropic,
  params: {
    system?: string;
    prompt: string;
    max_tokens: number;
    tools?: Anthropic.Messages.Tool[];
  },
  callbacks: StepCallbacks
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

// ── Step 1: Web search ────────────────────────────────────────────────

export async function runSearch(
  input: AnalysisInput,
  callbacks: StepCallbacks
): Promise<string> {
  const client = getClient();
  const queries = buildSearchQueries(input);

  let searchCount = 0;
  const findings = await streamCall(
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
      onText: callbacks.onText,
      onToolUse: () => {
        searchCount++;
        callbacks.onText(`\nRunning search ${searchCount}...\n`);
      },
    }
  );

  if (!findings.trim()) {
    throw new Error("Web search produced no results.");
  }

  return findings;
}

// ── Step 2: Identify stakeholders & network ───────────────────────────

export async function runNetwork(
  input: AnalysisInput,
  searchFindings: string,
  callbacks: StepCallbacks
): Promise<string> {
  const client = getClient();

  return streamCall(
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
    callbacks
  );
}

// ── Step 3: Cultural signals + risk flags ─────────────────────────────

export async function runCulture(
  input: AnalysisInput,
  searchFindings: string,
  callbacks: StepCallbacks
): Promise<string> {
  const client = getClient();
  const modeContext = getModeContext(input.mode);

  return streamCall(
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
    callbacks
  );
}

// ── Step 4: Generate markdown report ──────────────────────────────────

export async function runReport(
  input: AnalysisInput,
  searchFindings: string,
  networkJson: string,
  culturalJson: string,
  callbacks: StepCallbacks
): Promise<string> {
  const client = getClient();
  const modeContext = getModeContext(input.mode);

  return streamCall(
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
    callbacks
  );
}

// ── JSON parser ───────────────────────────────────────────────────────

export function parseJson(text: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(text.trim());
  } catch {
    // ignore
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }

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
