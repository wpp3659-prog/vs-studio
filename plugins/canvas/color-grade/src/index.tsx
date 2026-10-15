// 调色风格卡:12 种专业调色预设,给出色板 + 英文调色提示词,统一整片色调。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Grade = { name: string; en: string; colors: string[] };

const GRADES: Grade[] = [
    { name: "橙青对比", en: "teal and orange color grade, cinematic contrast, filmic highlights", colors: ["#0e3a44", "#1b6b7a", "#e8853d", "#f2c98a", "#f7f1e3"] },
    { name: "赛博霓虹", en: "cyberpunk neon grade, magenta and cyan glow, wet street reflections, night haze", colors: ["#12002e", "#7a1fa2", "#e040fb", "#00e5ff", "#0a0a12"] },
    { name: "黑白 Noir", en: "film noir black and white, high contrast, deep blacks, hard key light, venetian blind shadows", colors: ["#0a0a0a", "#3d3d3d", "#7a7a7a", "#c0c0c0", "#f2f2f2"] },
    { name: "柯达暖胶片", en: "Kodak Portra warm film emulation, creamy skin tones, soft grain, gentle halation", colors: ["#4a3428", "#9c6b4f", "#d9a06b", "#e8cfae", "#f7efe2"] },
    { name: "富士柔雾", en: "Fuji Eterna soft grade, low contrast, muted pastels, gentle roll-off, airy highlights", colors: ["#5a6b6e", "#93a8a4", "#c4cfc2", "#e3e2d2", "#f6f4ec"] },
    { name: "复古 70s", en: "vintage 1970s film grade, faded amber tones, warm yellows, period grain and dust", colors: ["#3b2f22", "#8a5a33", "#c98d4b", "#d9b878", "#efe3c3"] },
    { name: "北欧冷冽", en: "cold Nordic grade, steel blue and pale grey, overcast diffusion, minimal saturation", colors: ["#1d2733", "#3e5566", "#7d93a1", "#b8c4c9", "#e8ecee"] },
    { name: "金色怀旧", en: "golden nostalgic grade, honeyed sunset warmth, amber glow, dreamy bloom", colors: ["#402c1a", "#9c6b2f", "#d99a3d", "#f2c26b", "#faeccf"] },
    { name: "高调净白", en: "high-key clean grade, bright airy whites, minimal shadows, commercial product polish", colors: ["#c9d4d9", "#dfe7ea", "#eef2f4", "#f8fafa", "#ffffff"] },
    { name: "暗调情绪", en: "moody low-key grade, crushed shadows, single-source drama, desaturated accents", colors: ["#0c0e12", "#1e2430", "#3a4356", "#6b7280", "#9aa3ad"] },
    { name: "复古棕褐", en: "sepia antique grade, aged photograph warmth, brown monochrome, historical texture", colors: ["#2b1d12", "#6b4a2e", "#a3784f", "#cfae85", "#ecdcc2"] },
    { name: "青绿惊悚", en: "eerie green-teal thriller grade, sickly highlight cast, institutional cold, Fincher-like control", colors: ["#101c17", "#1f3a2e", "#3d6b52", "#7ba98c", "#c2d8c8"] },
];

function GradeContent({ ctx }: CanvasNodeContentProps) {
    const selected = (ctx.node.metadata?.grade as string | undefined) || "";
    const grade = GRADES.find((g) => g.name === selected);
    const [copied, setCopied] = useState(false);
    const [copiedHex, setCopiedHex] = useState(false);

    const pick = (name: string) => ctx.updateMetadata({ grade: name === selected ? "" : name });

    const copyEn = async () => {
        if (!grade) return;
        try {
            await navigator.clipboard.writeText(grade.en);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };
    const copyHex = async () => {
        if (!grade) return;
        try {
            await navigator.clipboard.writeText(grade.colors.join(", "));
            setCopiedHex(true);
            window.setTimeout(() => setCopiedHex(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 5, alignContent: "flex-start" }}>
                {GRADES.map((g) => (
                    <button key={g.name} type="button" onClick={() => pick(g.name)} style={{ ...btn, fontSize: 11, padding: "3px 9px", display: "inline-flex", alignItems: "center", gap: 5, background: g.name === selected ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: g.name === selected ? "#6366f1" : ctx.theme.node.stroke }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: `linear-gradient(135deg, ${g.colors[1]}, ${g.colors[3]})`, border: "1px solid rgba(0,0,0,.2)" }} />
                        {g.name}
                    </button>
                ))}
            </div>
            {grade ? (
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 10, background: ctx.theme.toolbar.panel, border: `1px solid ${ctx.theme.node.stroke}` }}>
                    <div style={{ display: "flex", gap: 4 }}>
                        {grade.colors.map((c) => (
                            <span key={c} style={{ flex: 1, height: 26, borderRadius: 6, background: c, border: "1px solid rgba(0,0,0,.15)" }} title={c} />
                        ))}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, opacity: 0.9, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word" }}>{grade.en}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={copyEn} style={btn}>{copied ? "已复制" : "复制英文调色词"}</button>
                        <button type="button" onClick={copyHex} style={btn}>{copiedHex ? "已复制" : "复制色值"}</button>
                    </div>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选调色风格,获得色板 + 英文调色提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "color-grade",
    name: "调色风格卡",
    version: "1.0.0",
    description: "12 种专业调色预设:色板 + 英文调色提示词,统一整片色调",
    nodes: [
        {
            type: "color-grade:card",
            title: "调色卡",
            icon: "🌈",
            description: "调色风格预设",
            defaultSize: { width: 400, height: 340 },
            defaultMetadata: { grade: "" },
            minimapColor: "#eab308",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const g = GRADES.find((x) => x.name === (node.metadata?.grade as string | undefined));
                return g ? { kind: "text", text: g.en } : null;
            },
            Content: GradeContent,
        },
    ],
});
