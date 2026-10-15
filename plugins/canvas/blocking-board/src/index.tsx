// 调度俯视板：用简化平面图安排演员与机位，并标记 180 度轴线侧。
import { definePlugin } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
type Placement = { id: string; name: string; kind: "角色" | "机位"; pos: string };
const POSITIONS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];
const POS_LABEL: Record<string, string> = { A1: "左前", A2: "中前", A3: "右前", B1: "左中", B2: "中间", B3: "右中", C1: "左后", C2: "中后", C3: "右后" };
const DEFAULTS: Placement[] = [{ id: "a", name: "角色 A", kind: "角色", pos: "A2" }, { id: "b", name: "角色 B", kind: "角色", pos: "B2" }, { id: "cam", name: "主机位", kind: "机位", pos: "C2" }];
function readItems(raw: unknown): Placement[] {
    if (!Array.isArray(raw)) return DEFAULTS;
    return raw.map((v, i) => { const x = v as Partial<Placement>; return { id: String(x.id || i), name: String(x.name || `标记 ${i + 1}`), kind: x.kind === "机位" ? "机位" : "角色", pos: POSITIONS.includes(String(x.pos)) ? String(x.pos) : "B2" }; });
}
function placementText(items: Placement[], axis: string, side: string) {
    return [`俯视调度图｜关系轴：${axis}｜机位侧：${side}`, ...items.map((x) => `${x.kind}「${x.name}」：${POS_LABEL[x.pos] || x.pos}`), "连续性提醒：正反打保持在关系轴同一侧；如需越轴，使用明确的过轴镜头或重新建立方向。"].join("\n");
}
function BlockingContent({ ctx }: CanvasNodeContentProps) {
    const items = readItems(ctx.node.metadata?.items);
    const axis = (ctx.node.metadata?.axis as string | undefined) || "横向关系轴";
    const side = (ctx.node.metadata?.side as string | undefined) || "上侧";
    const save = (next: Placement[]) => ctx.updateMetadata({ items: next });
    const patch = (id: string, key: keyof Placement, value: string) => save(items.map((x) => x.id === id ? { ...x, [key]: value } : x));
    const coords = (pos: string, index: number) => { const col = POSITIONS.indexOf(pos) % 3; const row = Math.floor(POSITIONS.indexOf(pos) / 3); const offset = ((index % 3) - 1) * 12; return { x: [55, 150, 245][col] + offset, y: [42, 92, 142][row] + offset * 0.25 }; };
    const sideFill = "rgba(99,102,241,.08)";
    const control = { padding: "4px 6px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 11, minWidth: 0 } as const;
    const btn = { ...control, cursor: "pointer", padding: "4px 9px" } as const;
    const text = placementText(items, axis, side);
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 7, padding: 10, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <svg viewBox="0 0 300 184" role="img" aria-label="场景调度俯视图" style={{ width: "100%", maxHeight: 184, flexShrink: 0, borderRadius: 10, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel }}>
            {axis === "横向关系轴" ? <rect x="12" y={side === "上侧" ? 12 : 96} width="276" height="76" fill={sideFill} /> : <rect x={side === "左侧" ? 12 : 153} y="12" width="135" height="160" fill={sideFill} />}
            <rect x="12" y="12" width="276" height="160" fill="none" stroke={ctx.theme.node.stroke} strokeWidth="1.2" />
            <line x1="104" y1="12" x2="104" y2="172" stroke={ctx.theme.node.stroke} strokeDasharray="3 4" />
            <line x1="196" y1="12" x2="196" y2="172" stroke={ctx.theme.node.stroke} strokeDasharray="3 4" />
            <line x1="12" y1="65" x2="288" y2="65" stroke={ctx.theme.node.stroke} strokeDasharray="3 4" />
            <line x1="12" y1="119" x2="288" y2="119" stroke={ctx.theme.node.stroke} strokeDasharray="3 4" />
            {axis === "横向关系轴" ? <line x1="24" y1="92" x2="276" y2="92" stroke="#f97316" strokeWidth="2" strokeDasharray="6 4" /> : <line x1="150" y1="20" x2="150" y2="164" stroke="#f97316" strokeWidth="2" strokeDasharray="6 4" />}
            <text x="18" y="10" fontSize="8" fill={ctx.theme.node.placeholder}>舞台 / 场景空间 · 俯视</text>
            {items.map((x, i) => { const p = coords(x.pos, i); return <g key={x.id}>
                {x.kind === "机位" ? <g><path d={`M ${p.x} ${p.y - 10} L ${p.x - 9} ${p.y + 7} L ${p.x + 9} ${p.y + 7} Z`} fill="#f97316" stroke="#fff" strokeWidth="1.5"/><circle cx={p.x} cy={p.y} r="2" fill="#fff"/></g> : <circle cx={p.x} cy={p.y} r="10" fill="#6366f1" stroke="#fff" strokeWidth="1.5"/>}
                <text x={p.x} y={p.y + 20} textAnchor="middle" fontSize="9" fill={ctx.theme.node.text}>{x.name.slice(0, 8)}</text>
            </g>; })}
        </svg>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 10.5, opacity: .75 }}>关系轴</label><select value={axis} onChange={(e) => ctx.updateMetadata({ axis: e.target.value, side: e.target.value === "横向关系轴" ? "上侧" : "左侧" })} style={control}><option>横向关系轴</option><option>纵向关系轴</option></select>
            <label style={{ fontSize: 10.5, opacity: .75 }}>主机位在</label><select value={side} onChange={(e) => ctx.updateMetadata({ side: e.target.value })} style={control}>{(axis === "横向关系轴" ? ["上侧", "下侧"] : ["左侧", "右侧"]).map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>{items.map((x) => <div key={x.id} style={{ display: "flex", gap: 4 }}>
            <input aria-label="角色或机位名称" value={x.name} onChange={(e) => patch(x.id, "name", e.target.value)} onWheel={stop} style={{ ...control, flex: 1 }} />
            <select aria-label="位置" value={x.pos} onChange={(e) => patch(x.id, "pos", e.target.value)} style={control}>{POSITIONS.map((p) => <option key={p} value={p}>{POS_LABEL[p]}</option>)}</select>
            {x.kind === "角色" && <button title="移除角色标记" onClick={() => save(items.filter((v) => v.id !== x.id))} style={btn}>×</button>}
        </div>)}</div>
        <div style={{ flexShrink: 0, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button disabled={items.filter((x) => x.kind === "角色").length >= 6} onClick={() => save([...items, { id: `actor-${Date.now()}`, name: `角色 ${items.filter((x) => x.kind === "角色").length + 1}`, kind: "角色", pos: "B2" }])} style={btn}>＋ 加角色</button>
            <span style={{ fontSize: 10.5, opacity: .7 }}>圆点=角色　橙色三角=机位</span>
        </div>
    </div>;
}
export default definePlugin({ id: "blocking-board", name: "场面调度俯视板", version: "1.0.0", description: "在俯视平面图安排演员与机位，标记 180 度关系轴与机位侧，减少正反打方向错误", nodes: [{ type: "blocking-board:stage", title: "场面调度", icon: "🗺", description: "演员/机位位置与关系轴俯视图", defaultSize: { width: 420, height: 450 }, defaultMetadata: { items: DEFAULTS, axis: "横向关系轴", side: "上侧" }, minimapColor: "#f97316", hidePanel: true, interactionToggle: true, resource: (node) => ({ kind: "text", text: placementText(readItems(node.metadata?.items), String(node.metadata?.axis || "横向关系轴"), String(node.metadata?.side || "上侧")) }), Content: BlockingContent }] });
