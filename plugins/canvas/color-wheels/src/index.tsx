// 色彩和谐生成器:选基色 + 和谐模式,按色彩理论实时计算配色方案。
// HSL 数学计算,无外部依赖;输出 hex 色板 + 英文配色提示词。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Scheme = { name: string; en: string; hues: number[]; sat: number[]; light: number[] };

const SCHEMES: Scheme[] = [
    { name: "互补色", en: "complementary color scheme, maximum chromatic tension", hues: [0, 180], sat: [70, 70], light: [55, 45] },
    { name: "类似色", en: "analogous color scheme, harmonious low-tension flow", hues: [-30, 0, 30], sat: [65, 70, 65], light: [58, 52, 62] },
    { name: "三角对立", en: "triadic color scheme, balanced vibrant diversity", hues: [0, 120, 240], sat: [68, 68, 68], light: [55, 52, 58] },
    { name: "分裂互补", en: "split-complementary color scheme, vivid yet softer than complementary", hues: [0, 150, 210], sat: [70, 65, 65], light: [52, 55, 48] },
    { name: "四角形", en: "tetradic color scheme, rich four-way balance", hues: [0, 90, 180, 270], sat: [62, 62, 62, 62], light: [55, 50, 55, 50] },
    { name: "单色阶", en: "monochromatic color scheme, tonal depth within one hue", hues: [0, 0, 0, 0], sat: [70, 65, 60, 55], light: [30, 45, 62, 80] },
];

function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to255 = (x: number) => Math.round(255 * x);
    return `#${[f(0), f(8), f(4)].map((v) => to255(v).toString(16).padStart(2, "0")).join("")}`;
}

function ColorWheelsContent({ ctx }: CanvasNodeContentProps) {
    const baseHue = Number(ctx.node.metadata?.baseHue ?? 210);
    const schemeName = (ctx.node.metadata?.scheme as string | undefined) || SCHEMES[0].name;
    const [copied, setCopied] = useState(false);
    const scheme = SCHEMES.find((s) => s.name === schemeName) || SCHEMES[0];

    const colors = scheme.hues.map((h, i) => hslToHex(baseHue + h, scheme.sat[i], scheme.light[i]));
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(colors.join(", "));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const chip = { padding: "3px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 10, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>基色(拖动改变色相)</div>
                <input type="range" min={0} max={359} value={baseHue} onChange={(e) => set({ baseHue: Number(e.target.value) })} onMouseDown={stop} style={{ width: "100%", accentColor: hslToHex(baseHue, 70, 55) }} />
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {SCHEMES.map((s) => (
                    <button key={s.name} type="button" onClick={() => set({ scheme: s.name })} style={{ ...chip, background: s.name === schemeName ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: s.name === schemeName ? "#6366f1" : ctx.theme.node.stroke }}>
                        {s.name}
                    </button>
                ))}
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 5, height: 44 }}>
                {colors.map((c, i) => (
                    <label key={i} title={c} style={{ flex: 1, position: "relative", borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid rgba(0,0,0,.15)", background: c, minWidth: 0 }}>
                        <span style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 8.5, color: "rgba(0,0,0,.55)", userSelect: "none" }}>{c.toUpperCase()}</span>
                    </label>
                ))}
            </div>
            <div style={{ flexShrink: 0, fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", opacity: 0.9, wordBreak: "break-word", padding: 8, borderRadius: 8, background: ctx.theme.toolbar.panel }}>{scheme.en}</div>
            <button type="button" onClick={copy} style={{ ...chip, flexShrink: 0, alignSelf: "flex-start", padding: "4px 10px" }}>
                {copied ? "已复制" : "复制色值"}
            </button>
        </div>
    );
}

export default definePlugin({
    id: "color-wheels",
    name: "色彩和谐生成器",
    version: "1.0.0",
    description: "按色彩理论实时计算和谐配色:互补/类似/三角/分裂互补/四角/单色阶",
    nodes: [
        {
            type: "color-wheels:generator",
            title: "配色",
            icon: "🎨",
            description: "色彩和谐配色计算",
            defaultSize: { width: 360, height: 340 },
            defaultMetadata: { baseHue: 210, scheme: SCHEMES[0].name },
            minimapColor: "#f43f5e",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const baseHue = Number(node.metadata?.baseHue ?? 210);
                const scheme = SCHEMES.find((s) => s.name === (node.metadata?.scheme as string | undefined)) || SCHEMES[0];
                return { kind: "text", text: scheme.hues.map((h, i) => hslToHex(baseHue + h, scheme.sat[i], scheme.light[i])).join(", ") };
            },
            Content: ColorWheelsContent,
        },
    ],
});
