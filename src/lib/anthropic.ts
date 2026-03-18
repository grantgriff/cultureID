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

const SYSTEM_PROMPT = `You are a culture sensing analyst. Your job is to analyze publicly available information about a person to infer:
1. Their professional network structure and key relationships
2. Cultural signals from their public communications
3. Risk flags or alignment indicators based on the user's context

Ground your analysis in social network theory:
- Identify hubs (high degree centrality), brokers (high betweenness), and peripheral nodes
- Assess network density and centralization
- Detect cultural markers in language patterns

Be specific and evidence-based. Cite sources. Acknowledge uncertainty where data is limited.
Never fabricate connections or data — only report what you actually find in search results.`;

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
Key questions: Do their network patterns suggest collaboration or solo work? Does their posting behavior suggest their pace? Who are their strongest connections? Are there shared network connections?
Emphasize: Cultural fit indicators, collaboration signals, potential red flags.`;
    case "customer":
      return `Context: POTENTIAL CUSTOMER assessment.
Focus on: decision-making structure, implementation readiness, pace, internal champions and blockers.
Key questions: How centralized is decision-making? Is their team technically sophisticated? What's their apparent pace? Who are the internal champions and blockers?
Emphasize: Decision-making structure, implementation readiness, stakeholder map.`;
    case "employer":
      return `Context: POTENTIAL EMPLOYER assessment.
Focus on: real culture beyond careers page, power dynamics, leadership style, work-life signals, turnover flags.
Key questions: What's the real culture? Who holds power? What do employees signal about work-life? Are there turnover red flags?
Emphasize: Leadership style, pace/intensity signals, employee sentiment patterns.`;
  }
}

const ANALYSIS_PROMPT = `Based on ALL the search results gathered, produce a comprehensive culture sensing analysis.

You MUST output valid JSON matching this exact schema (no markdown fencing, just raw JSON):
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
  "report_markdown": "string (full markdown report as specified below)"
}

For the report_markdown field, generate a complete report following this structure:
# Culture Sensing Report: [Target Name]
## Context: [Hire / Customer / Employer]
## Generated: [Today's date]

### Executive Summary
[2-3 sentence overview]

### Network Structure
[Network size, density, centralization, key clusters, power map table]

### Cultural Signals
[Pace & Intensity, Collaboration Orientation, Work-Life Indicators, Values - each with score and evidence]

### Risk Flags
[Bulleted list or "No significant risk flags detected"]

### Recommendations
[Context-specific recommendations]

### Methodology Note
This analysis is based on publicly available data and should be used to augment - not replace - direct engagement. Signals may be incomplete or reflect curated personas.

IMPORTANT RULES:
- Only include people and connections you actually found evidence for in search results
- Do not fabricate nodes or edges
- If data is limited, say so and keep the network small
- Aim for at least 5-15 nodes if the person has a public presence
- Always include the target person as a node with id "target"
- Every node referenced in edges must exist in the nodes array
- Every node must belong to at least one cluster`;

export interface AnalysisCallbacks {
  onStageChange: (stage: string) => void;
  onThinking: (stage: string, text: string) => void;
}

export async function runAnalysis(
  input: AnalysisInput,
  callbacks: AnalysisCallbacks
): Promise<AnalysisResult> {
  const { onStageChange, onThinking } = callbacks;
  const queries = buildSearchQueries(input);
  const modeContext = getModeContext(input.mode);
  const client = getClient();

  // Phase 1: Web search to gather data
  onStageChange("searching");

  const searchPrompt = `I need you to research the following person for a culture sensing analysis:

Name: ${input.name}
${input.company ? `Company: ${input.company}` : ""}
${input.title ? `Title: ${input.title}` : ""}

${modeContext}

Please search for this person using the following queries (use the web_search tool for each):
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

After completing all searches, compile everything you found into a detailed summary. Include:
- All people mentioned in connection with the target
- Any cultural signals from posts, articles, or quotes
- Company information and team structure
- Any relevant patterns you notice

Be thorough but factual — only report what you actually find.`;

  let searchFindings = "";
  let searchCount = 0;
  const searchStream = client.messages.stream({
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
    messages: [{ role: "user", content: searchPrompt }],
  });

  for await (const event of searchStream) {
    if (event.type === "content_block_start") {
      // Detect when a web search tool call starts
      if (
        event.content_block.type === "server_tool_use" &&
        event.content_block.name === "web_search"
      ) {
        searchCount++;
        onThinking(
          "searching",
          `Running search ${searchCount}...\n`
        );
      }
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      searchFindings += event.delta.text;
      onThinking("searching", event.delta.text);
    }
  }

  // Phase 2: Map connections from search findings
  onStageChange("mapping");

  const mappingPrompt = `Here are raw research findings about ${input.name}:

${searchFindings}

From these findings, extract a structured map of all people, organizations, and relationships found. For each person identified:
- Name, company, title (if found)
- How they relate to ${input.name} (direct colleague, co-author, mentioned together, etc.)
- Strength of evidence for the connection

Also identify clusters — groups of people who belong together (e.g. same company, same conference circuit, co-authors).

Output a detailed structured summary of the network. Be factual — only include connections with evidence from the search results.`;

  let mappingFindings = "";
  const mappingStream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: mappingPrompt }],
  });

  for await (const event of mappingStream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      mappingFindings += event.delta.text;
      onThinking("mapping", event.delta.text);
    }
  }

  // Phase 3: Analyze cultural signals
  onStageChange("analyzing");

  const analysisPrompt = `Here are the research findings about ${input.name}:

${searchFindings}

Here is the structured network mapping:

${mappingFindings}

${modeContext}

Now produce the structured analysis. ${ANALYSIS_PROMPT}`;

  let analysisText = "";
  const analysisStream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: analysisPrompt }],
  });

  for await (const event of analysisStream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      analysisText += event.delta.text;
      onThinking("analyzing", event.delta.text);
    }
  }

  // Phase 4: Parse and generate final output
  onStageChange("generating");
  onThinking("generating", "Parsing structured output...");

  // Parse JSON — handle potential markdown fencing
  const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : analysisText.trim();

  let result: AnalysisResult;
  try {
    result = JSON.parse(jsonStr);
  } catch (parseError) {
    // Try to extract JSON more aggressively — find first { to last }
    const firstBrace = analysisText.indexOf("{");
    const lastBrace = analysisText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = analysisText.slice(firstBrace, lastBrace + 1);
      try {
        result = JSON.parse(extracted);
      } catch {
        throw new Error(
          "Failed to parse analysis output as JSON. The model returned malformed data."
        );
      }
    } else {
      throw new Error(
        "Failed to parse analysis output. No JSON structure found in response."
      );
    }
  }

  onThinking("generating", "Validating network graph...");
  onStageChange("complete");
  return result;
}
