// 色彩氛围卡:给场景定色板(5 色)+ 氛围说明,供美术/摄影/生图提示词统一色调。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const DEFAULT_COLORS = ["#1d2b53", "#f26157", "#f7d08a", "#8fd3c7", "#f2efe9"];

function PaletteContent({ ctx }: CanvasNodeContentProps) {
    const name = (ctx.node.metadata?.name as string | undefined) || "";
    const note = (ctx.node.metadata?.note as string | undefined) || "";
    const colors = (Array.isArray(ctx.node.metadata?.colors) && (ctx.node.metadata?.colors as unknown[]).length === 5
        ? (ctx.node.metadata?.colors as string[])
        : DEFAULT_COLORS);
    const [copied, setCopied] = useState(false);

    const setColor = (i: number, value: string) => {
        const next = colors.slice();
        next[i] = value;
        ctx.updateMetadata({ colors: next });
    };

    const copyHex = async () => {
        try {
            await navigator.clipboard.writeText(colors.join(", "));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            <input
                value={name}
                placeholder="场景名,如「开场·清晨厨房」"
                onChange={(e) => ctx.updateMetadata({ name: e.target.value })}
                onWheel={stop}
                style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 6, flex: 1, minHeight: 60 }}>
                {colors.map((c, i) => (
                    <label key={i} title={c} style={{ flex: 1, position: "relative", borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid rgba(0,0,0,.15)", background: c, minWidth: 0 }}>
                        <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
                        <span style={{ position: "absolute", bottom: 3, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "rgba(0,0,0,.55)", userSelect: "none" }}>{c.toUpperCase()}</span>
                    </label>
                ))}
            </div>
            <textarea
                value={note}
                placeholder="氛围说明,如:低饱和暖调,顶光,阴影偏青…"
                onChange={(e) => ctx.updateMetadata({ note: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 44, resize: "none", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12, padding: 6, boxSizing: "border-box", lineHeight: 1.5 }}
            />
            <button type="button" onClick={copyHex} style={{ flexShrink: 0, alignSelf: "flex-start", padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 }}>
                {copied ? "已复制" : "复制色值"}
            </button>
        </div>
    );
}

export default definePlugin({
    id: "mood-palette",
    name: "色彩氛围卡",
    version: "1.0.0",
    description: "给场景定色板(5 色)+ 氛围说明,统一美术与生图色调",
    nodes: [
        {
            type: "mood-palette:palette",
            title: "氛围卡",
            icon: "🎨",
            description: "场景色彩氛围卡",
            defaultSize: { width: 300, height: 240 },
            defaultMetadata: { name: "", note: "", colors: DEFAULT_COLORS },
            minimapColor: "#d946ef",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const name = (node.metadata?.name as string | undefined) || "palette";
                const colors = (node.metadata?.colors as string[] | undefined) || DEFAULT_COLORS;
                return { kind: "text", text: `${name}: ${colors.join(", ")}` };
            },
            Content: PaletteContent,
        },
    ],
});
