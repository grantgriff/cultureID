"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { AnalysisResult, NetworkNode, NetworkEdge } from "@/lib/types";

interface NetworkGraphProps {
  data: AnalysisResult;
}

const ROLE_COLORS: Record<string, string> = {
  hub: "#6366f1",
  broker: "#f59e0b",
  boundary_spanner: "#10b981",
  gatekeeper: "#ef4444",
  peripheral: "#8b5cf6",
  isolate: "#6b7280",
};

const CLUSTER_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  company: string;
  title: string;
  role: string;
  centrality_score: number;
  cluster_id: string;
  relationship_to_target: string;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  strength: string;
  evidence: string;
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: NetworkNode;
  } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (!data.network.nodes.length) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Add zoom
    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Build cluster color map
    const clusterIds = [...new Set(data.network.nodes.map((n) => n.cluster_id))];
    const clusterColorMap: Record<string, string> = {};
    clusterIds.forEach((id, i) => {
      clusterColorMap[id] = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    });

    // Prepare simulation data
    const nodes: SimNode[] = data.network.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const edges: SimEdge[] = data.network.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        strength: e.strength,
        evidence: e.evidence,
      }));

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimEdge>(edges)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    // Draw edges
    const link = g
      .append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", (d) => {
        switch (d.strength) {
          case "strong":
            return 3;
          case "moderate":
            return 2;
          case "weak":
            return 1;
          default:
            return 1;
        }
      })
      .attr("stroke-dasharray", (d) =>
        d.strength === "inferred" ? "5,5" : "none"
      );

    // Draw nodes
    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    // Apply drag behavior
    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(dragBehavior);

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => {
        if (d.id === "target") return 20;
        return 8 + d.centrality_score * 12;
      })
      .attr("fill", (d) => clusterColorMap[d.cluster_id] || "#6b7280")
      .attr("stroke", (d) => ROLE_COLORS[d.role] || "#6b7280")
      .attr("stroke-width", (d) => (d.id === "target" ? 4 : 2))
      .attr("opacity", 0.9);

    // Node labels
    node
      .append("text")
      .text((d) => {
        if (d.id === "target") return d.name;
        // Abbreviate to first name + last initial
        const parts = d.name.split(" ");
        if (parts.length > 1)
          return `${parts[0]} ${parts[parts.length - 1][0]}.`;
        return d.name;
      })
      .attr("text-anchor", "middle")
      .attr("dy", (d) => {
        const r = d.id === "target" ? 20 : 8 + d.centrality_score * 12;
        return r + 14;
      })
      .attr("fill", "#d1d5db")
      .attr("font-size", (d) => (d.id === "target" ? "12px" : "10px"))
      .attr("font-weight", (d) => (d.id === "target" ? "bold" : "normal"));

    // Hover events
    node
      .on("mouseenter", (event, d) => {
        const rect = container.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          node: d as unknown as NetworkNode,
        });
      })
      .on("mouseleave", () => {
        setTooltip(null);
      });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <svg ref={svgRef} className="w-full h-full" />

      {tooltip && (
        <div
          className="absolute z-10 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm pointer-events-none shadow-xl"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            maxWidth: 250,
          }}
        >
          <div className="font-medium text-white">{tooltip.node.name}</div>
          <div className="text-gray-400 text-xs">
            {tooltip.node.title}
            {tooltip.node.company ? ` @ ${tooltip.node.company}` : ""}
          </div>
          <div className="mt-1 flex gap-2 text-xs">
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: ROLE_COLORS[tooltip.node.role] + "33",
                color: ROLE_COLORS[tooltip.node.role],
              }}
            >
              {tooltip.node.role.replace("_", " ")}
            </span>
            <span className="text-gray-500">
              {tooltip.node.relationship_to_target}
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="text-gray-400 font-medium mb-1">Node Roles</div>
        {Object.entries(ROLE_COLORS).map(([role, color]) => (
          <div key={role} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full border-2"
              style={{ borderColor: color }}
            />
            <span className="text-gray-400 capitalize">
              {role.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
