// 构图指南:8 种经典构图的 SVG 叠加示意(三分法/黄金分割/对角线/螺旋等),
// 备注框写画面用途,点选构图切换叠加线。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Comp = { name: string; en: string; desc: string; overlay: (w: number, h: number) => React.ReactNode };

const phi = 0.618;
const L = (x1: number, y1: number, x2: number, y2: number, k: string) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(99,102,241,.75)" strokeWidth={1.2} strokeDasharray="4 3" />
);

const COMPS: Comp[] = [
    {
        name: "三分法", en: "rule of thirds composition, subject placed on the intersection points", desc: "主体放在四个交叉点上,最通用的安全构图",
        overlay: (w, h) => (
            <g>
                {L((w / 3), 0, w / 3, h, "v1")}{L((2 * w) / 3, 0, (2 * w) / 3, h, "v2")}
                {L(0, h / 3, w, h / 3, "h1")}{L(0, (2 * h) / 3, w, (2 * h) / 3, "h2")}
                {[[w / 3, h / 3], [(2 * w) / 3, h / 3], [w / 3, (2 * h) / 3], [(2 * w) / 3, (2 * h) / 3]].map(([x, y], i) => (
                    <circle key={`p${i}`} cx={x} cy={y} r={3} fill="rgba(99,102,241,.9)" />
                ))}
            </g>
        ),
    },
    {
        name: "黄金分割", en: "golden ratio composition, subject along the phi division lines", desc: "按 0.618 分割,比三分法更平衡",
        overlay: (w, h) => (
            <g>
                {L(w * phi, 0, w * phi, h, "gv1")}{L(w * (1 - phi), 0, w * (1 - phi), h, "gv2")}
                {L(0, h * phi, w, h * phi, "gh1")}{L(0, h * (1 - phi), w, h * (1 - phi), "gh2")}
            </g>
        ),
    },
    {
        name: "对角线", en: "diagonal composition, dynamic energy along the diagonals", desc: "沿对角线布置主体,画面有动势",
        overlay: (w, h) => (
            <g>
                {L(0, 0, w, h, "d1")}{L(w, 0, 0, h, "d2")}
            </g>
        ),
    },
    {
        name: "中心构图", en: "centered symmetrical composition, strong formal stability", desc: "主体居中,庄重对称(韦斯·安德森常用)",
        overlay: (w, h) => (
            <g>
                {L(w / 2, 0, w / 2, h, "c1")}{L(0, h / 2, w, h / 2, "c2")}
            </g>
        ),
    },
    {
        name: "三角形", en: "triangular composition, stable pyramid structure of the subjects", desc: "主体构成三角,稳定又富有层次",
        overlay: (w, h) => (
            <g>
                <polygon points={`${w / 2},${h * 0.18} ${w * 0.16},${h * 0.85} ${w * 0.84},${h * 0.85}`} fill="rgba(99,102,241,.10)" stroke="rgba(99,102,241,.75)" strokeWidth={1.2} strokeDasharray="4 3" />
            </g>
        ),
    },
    {
        name: "黄金螺旋", en: "golden spiral composition, eye flows along the fibonacci curve", desc: "视线沿螺旋卷入焦点,斐波那契曲线",
        overlay: (w, h) => {
            // 参数化黄金螺旋 r = a·φ^(2θ/π),中心取画面中心,a 按短边缩放
            const pts: string[] = [];
            const a = Math.min(w, h) / 2 / Math.pow(phi, 2); // 起始半径,保证外圈贴合画面
            for (let i = 0; i <= 60; i++) {
                const theta = (i / 60) * Math.PI * 3.2; // 约 1.6 圈
                const r = a * Math.pow(phi, (2 * theta) / Math.PI);
                const x = w / 2 + r * Math.cos(theta);
                const y = h / 2 + r * Math.sin(theta);
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            }
            return <polyline points={pts.join(" ")} fill="none" stroke="rgba(99,102,241,.75)" strokeWidth={1.2} strokeDasharray="4 3" />;
        },
    },
    {
        name: "水平线", en: "low horizon line composition, vast sky dominance", desc: "低地平线,天空占主导(史诗感)",
        overlay: (w, h) => (
            <g>
                {L(0, h * 0.3, w, h * 0.3, "horizon")}
                <rect x={0} y={0} width={w} height={h * 0.3} fill="rgba(99,102,241,.06)" />
            </g>
        ),
    },
    {
        name: "负空间", en: "extreme negative space, tiny subject against vast emptiness", desc: "大留白衬小主体,孤独/高级感",
        overlay: (w, h) => (
            <g>
                <rect x={w * 0.62} y={h * 0.18} width={w * 0.2} height={h * 0.2} fill="rgba(99,102,241,.14)" stroke="rgba(99,102,241,.75)" strokeWidth={1.2} strokeDasharray="4 3" />
                <rect x={w * 0.08} y={h * 0.1} width={w * 0.46} height={h * 0.78} fill="rgba(99,102,241,.05)" />
            </g>
        ),
    },
];

function GuideContent({ ctx }: CanvasNodeContentProps) {
    const note = (ctx.node.metadata?.note as string | undefined) || "";
    const [copied, setCopied] = useState(false);
    const selected = (ctx.node.metadata?.comp as string | undefined) || COMPS[0].name;
    const comp = COMPS.find((c) => c.name === selected) || COMPS[0];
    const [copiedEn, setCopiedEn] = useState(false);

    const copyEn = async () => {
        try {
            await navigator.clipboard.writeText(comp.en);
            setCopiedEn(true);
            window.setTimeout(() => setCopiedEn(false), 1200);
        } catch { /* 忽略 */ }
    };

    const chip = { padding: "3px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {COMPS.map((c) => (
                    <button key={c.name} type="button" title={c.desc} onClick={() => ctx.updateMetadata({ comp: c.name })} style={{ ...chip, background: c.name === selected ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: c.name === selected ? "#6366f1" : ctx.theme.node.stroke }}>
                        {c.name}
                    </button>
                ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: "rgba(0,0,0,.25)", borderRadius: 10, overflow: "hidden" }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block" }}>
                    {comp.overlay(100, 100)}
                </svg>
                <span style={{ position: "absolute", top: 6, left: 8, fontSize: 11, fontWeight: 600, color: "rgba(99,102,241,.95)" }}>{comp.name}</span>
            </div>
            <div style={{ flexShrink: 0, fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{comp.desc}</div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                    value={note}
                    placeholder="备注:这条构图用在哪一镜…"
                    onChange={(e) => ctx.updateMetadata({ note: e.target.value })}
                    onWheel={stop}
                    style={{ flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }}
                />
                <button type="button" onClick={copyEn} style={chip}>{copiedEn ? "已复制" : "复制英文构图词"}</button>
            </div>
        </div>
    );
}

export default definePlugin({
    id: "composition-guide",
    name: "构图指南",
    version: "1.0.0",
    description: "8 种经典构图的叠加示意:三分法/黄金分割/对角线/螺旋等,附英文构图提示词",
    nodes: [
        {
            type: "composition-guide:card",
            title: "构图",
            icon: "📐",
            description: "构图参考示意",
            defaultSize: { width: 380, height: 420 },
            defaultMetadata: { comp: COMPS[0].name, note: "" },
            minimapColor: "#6366f1",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const c = COMPS.find((x) => x.name === (node.metadata?.comp as string | undefined));
                return c ? { kind: "text", text: c.en } : null;
            },
            Content: GuideContent,
        },
    ],
});
