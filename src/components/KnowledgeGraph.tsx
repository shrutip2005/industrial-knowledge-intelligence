import { useEffect, useRef, useState } from "react";

export interface KgNode {
  id: string; label: string; node_type: string; detail: string;
  x: number; y: number; r: number; color: string;
}
export interface KgEdge { id: string; source_id: string; target_id: string; }

interface Props { nodes: KgNode[]; edges: KgEdge[]; }

const VBW = 900;
const VBH = 380;

export function KnowledgeGraph({ nodes: initialNodes, edges }: Props) {
  const [nodes, setNodes] = useState<KgNode[]>(initialNodes);
  const [view, setView] = useState({ x: 0, y: 0, w: VBW, h: VBH });
  const [hover, setHover] = useState<{ n: KgNode; sx: number; sy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<
    | { type: "node"; id: string; offX: number; offY: number }
    | { type: "pan"; startX: number; startY: number; view: typeof view }
    | null
  >(null);

  useEffect(() => { setNodes(initialNodes); }, [initialNodes]);

  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.w,
      y: view.y + ((clientY - rect.top) / rect.height) * view.h,
    };
  };

  const onNodeDown = (e: React.PointerEvent, n: KgNode) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    dragRef.current = { type: "node", id: n.id, offX: p.x - n.x, offY: p.y - n.y };
  };

  const onSvgDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { type: "pan", startX: e.clientX, startY: e.clientY, view };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.type === "node") {
      const p = toSvg(e.clientX, e.clientY);
      setNodes((ns) => ns.map((x) => x.id === d.id ? { ...x, x: p.x - d.offX, y: p.y - d.offY } : x));
    } else {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - d.startX) / rect.width) * d.view.w;
      const dy = ((e.clientY - d.startY) / rect.height) * d.view.h;
      setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
    }
  };

  const onUp = () => { dragRef.current = null; };

  const zoom = (factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const nw = Math.min(Math.max(v.w * factor, 150), 4000);
      const nh = Math.min(Math.max(v.h * factor, 60), 2000);
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      return { x: px - (px - v.x) * (nw / v.w), y: py - (py - v.y) * (nh / v.h), w: nw, h: nh };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 0.87, p.x, p.y);
  };

  const reset = () => setView({ x: 0, y: 0, w: VBW, h: VBH });

  return (
    <div className="kg-wrap" style={{ position: "relative" }}>
      <div className="kg-legend">
        <div className="li"><span className="sw" style={{ background: "var(--steel-500)" }} />Equipment</div>
        <div className="li"><span className="sw" style={{ background: "#6b7fa3" }} />Document</div>
        <div className="li"><span className="sw" style={{ background: "var(--red)" }} />Failure</div>
        <div className="li"><span className="sw" style={{ background: "var(--green)" }} />Procedure</div>
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, zIndex: 3 }}>
        <button type="button" onClick={() => zoom(0.8)} title="Zoom in" style={btn}>＋</button>
        <button type="button" onClick={() => zoom(1.25)} title="Zoom out" style={btn}>−</button>
        <button type="button" onClick={reset} title="Reset view" style={{ ...btn, width: "auto", padding: "0 10px" }}>Reset</button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: dragRef.current?.type === "pan" ? "grabbing" : "grab", background: "#fafcff", borderRadius: 10 }}
        onPointerDown={onSvgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
      >
        {edges.map((e) => {
          const a = nodeById[e.source_id]; const b = nodeById[e.target_id];
          if (!a || !b) return null;
          return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c8d2e0" strokeWidth={1.6} />;
        })}
        {nodes.map((n) => (
          <g key={n.id} style={{ cursor: "grab" }}
            onPointerDown={(ev) => onNodeDown(ev, n)}
            onPointerEnter={(ev) => {
              const rect = svgRef.current!.getBoundingClientRect();
              setHover({ n, sx: ev.clientX - rect.left + 14, sy: ev.clientY - rect.top - 10 });
            }}
            onPointerMove={(ev) => {
              if (dragRef.current) return;
              const rect = svgRef.current!.getBoundingClientRect();
              setHover({ n, sx: ev.clientX - rect.left + 14, sy: ev.clientY - rect.top - 10 });
            }}
            onPointerLeave={() => setHover(null)}
          >
            <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke="#fff" strokeWidth={2.5} />
            <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#152238" style={{ pointerEvents: "none", userSelect: "none" }}>{n.label}</text>
          </g>
        ))}
        {nodes.length === 0 && (
          <text x={VBW / 2} y={VBH / 2} textAnchor="middle" fontSize={13} fill="#8ea0bc">
            Knowledge graph populates as you upload documents.
          </text>
        )}
      </svg>

      {hover && (
        <div className="kg-tooltip" style={{ left: hover.sx, top: hover.sy, opacity: 1 }}>
          <b>{hover.n.label}</b><br />{hover.n.detail}
        </div>
      )}

      <div style={{ position: "absolute", left: 12, bottom: 10, fontSize: 11, color: "#6b7a94" }}>
        Drag nodes to rearrange · drag background to pan · scroll to zoom
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(20,34,56,.12)",
  background: "#fff", color: "#152238", fontWeight: 700, fontSize: 15, cursor: "pointer",
  boxShadow: "0 1px 3px rgba(20,34,56,.08)",
};
