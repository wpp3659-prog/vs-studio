// 网页嵌入节点:沙箱 iframe 嵌入网页,可从上游文本节点读取网址。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function normalizeUrl(raw: string): string {
    const url = raw.trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
}

function EmbedContent({ ctx }: CanvasNodeContentProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const editing = Boolean(ctx.node.metadata?.editing);
    const url = normalizeUrl((ctx.node.metadata?.url as string | undefined) || "");
    const upstreamUrl = ctx.getUpstream().map((n) => n.metadata?.content).filter(Boolean).join("\n").trim();
    const draftValue = draft ?? (ctx.node.metadata?.url as string | undefined) ?? upstreamUrl;

    if (editing) {
        return (
            <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
                <input
                    autoFocus
                    value={draftValue}
                    placeholder="example.com/page"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                            e.stopPropagation();
                            ctx.updateMetadata({ url: normalizeUrl(draftValue), editing: false });
                            setDraft(null);
                        }
                    }}
                    style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 13 }}
                />
                {upstreamUrl && url !== normalizeUrl(upstreamUrl) && (
                    <button type="button" onClick={() => { ctx.updateMetadata({ url: normalizeUrl(upstreamUrl) }); setDraft(null); }} style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 }}>
                        用上游网址
                    </button>
                )}
                <div style={{ fontSize: 12, color: ctx.theme.node.placeholder }}>回车确认;部分网站禁止被嵌入,显示空白属正常。</div>
            </div>
        );
    }

    if (!url) {
        return (
            <div data-canvas-no-zoom onMouseDown={stop} style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.placeholder, fontSize: 13, padding: 16, boxSizing: "border-box", textAlign: "center" }}>
                点工具条「✎ 编辑」输入要嵌入的网址
            </div>
        );
    }

    return (
        <div data-canvas-no-zoom style={{ height: "100%", width: "100%", background: ctx.theme.node.fill, borderRadius: 16, overflow: "hidden", boxSizing: "border-box" }}>
            <iframe src={url} title="web-embed" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
        </div>
    );
}

export default definePlugin({
    id: "web-embed",
    name: "网页嵌入节点",
    version: "1.0.0",
    description: "在画布中嵌入网页(iframe),可从上游文本节点读取网址",
    nodes: [
        {
            type: "web-embed:frame",
            title: "网页",
            icon: "🖥",
            description: "嵌入网页展示",
            defaultSize: { width: 480, height: 360 },
            defaultMetadata: { url: "" },
            minimapColor: "#8b5cf6",
            hidePanel: true,
            interactionToggle: true,
            forceInteractive: (node) => Boolean(node.metadata?.editing),
            Content: EmbedContent,
            toolbar: (ctx) => {
                const editing = Boolean(ctx.node.metadata?.editing);
                return [
                    {
                        id: "embed-toggle-edit",
                        title: editing ? "完成" : "编辑网址",
                        label: editing ? "完成" : "编辑",
                        icon: editing ? "✓" : "✎",
                        active: editing,
                        onClick: () => ctx.updateMetadata({ editing: !editing }),
                    },
                ];
            },
        },
    ],
});
