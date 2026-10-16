// 广告拆解卡:粘贴一条广告的描述/链接,AI 按专业框架拆解为可借鉴要点。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const SYSTEM =
    "你是资深广告导演兼策略策划。用户给你一条广告的描述(或脚本/逐字稿)。" +
    "按以下框架输出中文拆解,每节用「■」开头的小标题:" +
    "① 基本盘(品类/目标人群/核心信息);" +
    "② 钩子(前 3 秒抓住了什么,用了什么手法);" +
    "③ 结构节奏(逐段:起-承-转-合,各段时长与功能);" +
    "④ 视听手法(运镜/剪辑/调色/音乐音效的特点);" +
    "⑤ 文案亮点(金句与记忆点);" +
    "⑥ 可偷师清单(3-5 条可直接搬到自己项目里的具体做法)。" +
    "直接输出,不要解释。";

function TeardownContent({ ctx }: CanvasNodeContentProps) {
    const input = (ctx.node.metadata?.input as string | undefined) || "";
    const result = (ctx.node.metadata?.result as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!input.trim() || busy) return;
        setBusy(true);
        try {
            const r = await ctx.generateText(`广告内容:\n${input.trim()}`, { system: SYSTEM });
            if (r.text.trim()) set({ result: r.text.trim() });
        } catch (err) {
            set({ result: `⚠ 拆解失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0 }}>
                {ctx.renderPromptInput({
                    value: input,
                    onChange: (v) => set({ input: v }),
                    placeholder: "粘贴广告描述/逐字稿,如:「苹果新年片,女孩用 Mac 剪辑全家福,结尾全家围坐看片…」越具体拆得越准;也可用 @ 引用上游文字节点",
                    style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 76, maxHeight: 160 },
                })}
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={generate} disabled={busy || !input.trim()} style={primary}>
                    {busy ? "拆解中…" : result ? "✨ 重新拆解" : "✨ 拆解这支广告"}
                </button>
                {result && !busy ? (
                    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }} style={btn}>{copied ? "已复制" : "复制"}</button>
                ) : null}
            </div>
            <textarea
                value={result}
                placeholder="拆解报告会出现在这里:钩子/结构/视听/文案/可偷师清单…"
                onChange={(e) => set({ result: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }}
            />
        </div>
    );
}

export default definePlugin({
    id: "ad-teardown",
    name: "广告拆解卡",
    version: "1.1.0",
    description: "粘贴广告描述,AI 按专业框架拆解:钩子/结构节奏/视听手法/文案亮点/可偷师清单",
    nodes: [
        {
            type: "ad-teardown:card",
            title: "广告拆解",
            icon: "🔍",
            description: "AI 竞品广告拆解:钩子/结构/视听/文案/可偷师清单",
            defaultSize: { width: 480, height: 500 },
            defaultMetadata: { input: "", result: "" },
            minimapColor: "#f97316",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = node.metadata?.result as string | undefined;
                return text ? { kind: "text", text } : null;
            },
            Content: TeardownContent,
        },
    ],
});
