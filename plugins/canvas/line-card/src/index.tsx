// 台词卡:角色 + 台词 + 表演提示(情绪/停顿/重音),供配音、演员、字幕环节使用。
import { definePlugin } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Line = { id: number; who: string; text: string; note: string };

function normalize(raw: unknown): Line[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((it, i) => ({
        id: Number((it as Line).id) || i + 1,
        who: String((it as Line).who ?? ""),
        text: String((it as Line).text ?? ""),
        note: String((it as Line).note ?? ""),
    }));
}

function LineCardContent({ ctx }: CanvasNodeContentProps) {
    const lines = normalize(ctx.node.metadata?.lines);
    const setLines = (next: Line[]) => ctx.updateMetadata({ lines: next });
    const patch = (id: number, key: keyof Omit<Line, "id">, value: string) =>
        setLines(lines.map((l) => (l.id === id ? { ...l, [key]: value } : l)));

    const input = {
        border: "none", outline: "none", background: "transparent", color: ctx.theme.node.text,
        fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
    } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", overflow: "auto", boxSizing: "border-box", padding: 10, display: "flex", flexDirection: "column", gap: 8, background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            {lines.length === 0 && <div style={{ fontSize: 12, color: ctx.theme.node.placeholder }}>点工具条「加台词」开始写…</div>}
            {lines.map((l) => (
                <div key={l.id} style={{ border: `1px solid ${ctx.theme.node.stroke}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4, background: ctx.theme.toolbar.panel }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={l.who} placeholder="角色" onChange={(e) => patch(l.id, "who", e.target.value)} onWheel={stop} style={{ ...input, width: 90, fontWeight: 600, fontSize: 12, flexShrink: 0 }} />
                        <input value={l.note} placeholder="表演提示:情绪/停顿/重音…" onChange={(e) => patch(l.id, "note", e.target.value)} onWheel={stop} style={{ ...input, fontSize: 11, opacity: 0.75, flex: 1, minWidth: 0 }} />
                        <button type="button" title="删除本条" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} style={{ flexShrink: 0, border: "none", background: "transparent", color: ctx.theme.node.placeholder, cursor: "pointer", fontSize: 12 }}>
                            ✕
                        </button>
                    </div>
                    <textarea value={l.text} placeholder="台词内容…" rows={2} onChange={(e) => patch(l.id, "text", e.target.value)} onWheel={stop} style={{ ...input, resize: "vertical", minHeight: 36, lineHeight: 1.5 }} />
                </div>
            ))}
        </div>
    );
}

export default definePlugin({
    id: "line-card",
    name: "台词卡",
    version: "1.0.0",
    description: "角色台词卡:台词 + 表演提示,一键复制完整台词本",
    nodes: [
        {
            type: "line-card:lines",
            title: "台词卡",
            icon: "💬",
            description: "角色台词与表演提示",
            defaultSize: { width: 380, height: 300 },
            defaultMetadata: { lines: [] },
            minimapColor: "#14b8a6",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => ({
                kind: "text",
                text: normalize(node.metadata?.lines)
                    .map((l) => [l.who, l.note && `(${l.note})`, l.text].filter(Boolean).join(" "))
                    .join("\n"),
            }),
            Content: LineCardContent,
            toolbar: (ctx) => {
                const lines = normalize(ctx.node.metadata?.lines);
                return [
                    {
                        id: "lc-add",
                        title: "新增一句台词",
                        label: "加台词",
                        icon: "➕",
                        onClick: () => ctx.updateMetadata({ lines: [...lines, { id: Date.now(), who: "", text: "", note: "" }] }),
                    },
                    {
                        id: "lc-copy",
                        title: "复制完整台词本(角色 + 提示 + 台词)",
                        label: "复制台词本",
                        icon: "📋",
                        onClick: () =>
                            navigator.clipboard.writeText(
                                normalize(ctx.node.metadata?.lines)
                                    .map((l) => [l.who, l.note && `(${l.note})`, l.text].filter(Boolean).join(" "))
                                    .join("\n\n"),
                            ),
                    },
                ];
            },
        },
    ],
});
