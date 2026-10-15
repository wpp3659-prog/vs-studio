// 代码块节点:等宽编辑/展示代码,行号 + 一键复制,可接收上游文本。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function CodeContent({ ctx }: CanvasNodeContentProps) {
    const [copied, setCopied] = useState(false);
    const editing = Boolean(ctx.node.metadata?.editing);
    const content = (ctx.node.metadata?.content as string | undefined) || "";
    const upstreamText = ctx.getUpstream().map((n) => n.metadata?.content).filter(Boolean).join("\n");
    const shown = content || upstreamText;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shown);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            /* 忽略:无剪贴板权限时静默 */
        }
    };

    const lines = shown ? shown.split("\n") : [];

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", background: ctx.theme.node.fill, color: ctx.theme.node.text, borderRadius: 16, overflow: "hidden", position: "relative" }}>
            {!editing && (
                <button type="button" onClick={copy} title="复制全部代码" style={{ position: "absolute", top: 8, right: 8, zIndex: 5, padding: "3px 10px", fontSize: 11, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer" }}>
                    {copied ? "已复制" : "复制"}
                </button>
            )}
            {editing ? (
                <textarea
                    autoFocus
                    value={content}
                    placeholder="// 输入代码…"
                    onChange={(e) => ctx.updateMetadata({ content: e.target.value })}
                    onBlur={() => ctx.updateMetadata({ editing: false })}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.stopPropagation();
                            ctx.updateMetadata({ editing: false });
                        }
                    }}
                    onWheel={stop}
                    style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", color: ctx.theme.node.text, fontFamily: "Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.55, padding: 12, boxSizing: "border-box" }}
                />
            ) : (
                <div style={{ flex: 1, display: "flex", overflow: "auto", minHeight: 0 }}>
                    <div style={{ flexShrink: 0, padding: "12px 6px 12px 12px", textAlign: "right", color: ctx.theme.node.placeholder, fontFamily: "Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.55, userSelect: "none", borderRight: `1px solid ${ctx.theme.node.stroke}`, opacity: 0.6 }}>
                        {lines.map((_, i) => (
                            <div key={i}>{i + 1}</div>
                        ))}
                    </div>
                    <div style={{ flex: 1, padding: 12, whiteSpace: "pre", fontFamily: "Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.55, minWidth: 0 }}>
                        {shown || <span style={{ color: ctx.theme.node.placeholder }}>点工具条「✎ 编辑」输入代码,或连一个上游文本节点</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "code-block",
    name: "代码块节点",
    version: "1.0.0",
    description: "等宽展示与编辑代码,行号显示 + 一键复制,可接收上游文本",
    nodes: [
        {
            type: "code-block:code",
            title: "代码块",
            icon: "🧩",
            description: "代码展示与编辑",
            defaultSize: { width: 380, height: 280 },
            defaultMetadata: { content: "" },
            minimapColor: "#10b981",
            hidePanel: true,
            interactionToggle: true,
            forceInteractive: (node) => Boolean(node.metadata?.editing),
            resource: (node) => ({ kind: "text", text: node.metadata?.content }),
            Content: CodeContent,
            toolbar: (ctx) => {
                const editing = Boolean(ctx.node.metadata?.editing);
                return [
                    {
                        id: "code-toggle-edit",
                        title: editing ? "退出编辑" : "编辑代码",
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
