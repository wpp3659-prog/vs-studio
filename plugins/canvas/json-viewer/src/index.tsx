// JSON 查看器节点:格式化展示 JSON,错误提示 + 一键复制,可接收上游文本。
import { definePlugin, useMemo, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function tryFormat(source: string): { ok: true; pretty: string } | { ok: false; error: string } {
    try {
        return { ok: true, pretty: JSON.stringify(JSON.parse(source), null, 2) };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

function JsonContent({ ctx }: CanvasNodeContentProps) {
    const [copied, setCopied] = useState(false);
    const editing = Boolean(ctx.node.metadata?.editing);
    const content = (ctx.node.metadata?.content as string | undefined) || "";
    const upstreamText = ctx.getUpstream().map((n) => n.metadata?.content).filter(Boolean).join("\n");
    const shown = content || upstreamText;
    const result = useMemo(() => (shown.trim() ? tryFormat(shown) : null), [shown]);

    const copy = async () => {
        if (!result?.ok) return;
        try {
            await navigator.clipboard.writeText(result.pretty);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            /* 忽略 */
        }
    };

    if (editing) {
        return (
            <textarea
                autoFocus
                value={content}
                placeholder='{"粘贴 JSON…": true}'
                onChange={(e) => ctx.updateMetadata({ content: e.target.value })}
                onBlur={() => ctx.updateMetadata({ editing: false })}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        ctx.updateMetadata({ editing: false });
                    }
                }}
                onWheel={stop}
                onMouseDown={stop}
                style={{ height: "100%", width: "100%", resize: "none", border: "none", outline: "none", background: ctx.theme.node.fill, color: ctx.theme.node.text, borderRadius: 16, boxSizing: "border-box", padding: 12, fontFamily: "Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.55 }}
            />
        );
    }

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, overflow: "hidden", position: "relative", color: ctx.theme.node.text }}>
            {result?.ok && (
                <button type="button" onClick={copy} title="复制格式化结果" style={{ position: "absolute", top: 8, right: 8, zIndex: 5, padding: "3px 10px", fontSize: 11, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer" }}>
                    {copied ? "已复制" : "复制"}
                </button>
            )}
            <div style={{ flex: 1, overflow: "auto", padding: 12, fontFamily: "Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: 0 }}>
                {result === null ? (
                    <span style={{ color: ctx.theme.node.placeholder }}>点工具条「✎ 编辑」粘贴 JSON,或连一个上游文本节点</span>
                ) : result.ok ? (
                    result.pretty
                ) : (
                    <span style={{ color: "#f87171" }}>✕ JSON 解析失败:{result.error}</span>
                )}
            </div>
        </div>
    );
}

export default definePlugin({
    id: "json-viewer",
    name: "JSON 查看器",
    version: "1.0.0",
    description: "格式化展示 JSON,错误提示 + 一键复制,可接收上游文本",
    nodes: [
        {
            type: "json-viewer:json",
            title: "JSON",
            icon: "🧾",
            description: "JSON 格式化查看",
            defaultSize: { width: 380, height: 280 },
            defaultMetadata: { content: "" },
            minimapColor: "#f59e0b",
            hidePanel: true,
            interactionToggle: true,
            forceInteractive: (node) => Boolean(node.metadata?.editing),
            resource: (node) => ({ kind: "text", text: node.metadata?.content }),
            Content: JsonContent,
            toolbar: (ctx) => {
                const editing = Boolean(ctx.node.metadata?.editing);
                return [
                    {
                        id: "json-toggle-edit",
                        title: editing ? "查看格式化结果" : "编辑 JSON 源码",
                        label: editing ? "预览" : "编辑",
                        icon: editing ? "👁" : "✎",
                        active: editing,
                        onClick: () => ctx.updateMetadata({ editing: !editing }),
                    },
                ];
            },
        },
    ],
});
