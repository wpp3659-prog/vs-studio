// 提示词链:首帧图提示词 → 尾帧图提示词 → 动作描述,拼成首尾帧视频生成的完整链。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const SYSTEM =
    "你是视频生成提示词专家。用户给出首帧画面与尾帧画面的中文描述(以及可选的动作描述)。" +
    "输出三段,严格用这三个标签,每段一段:" +
    "FIRST: polished English image prompt for the first frame, 50-90 words" +
    "LAST: polished English image prompt for the last frame, consistent character/scene/lighting with the first frame, 50-90 words" +
    "MOTION: one concise English sentence describing the camera move and subject motion between the two frames" +
    "直接输出,不要解释。";

function PromptChainContent({ ctx }: CanvasNodeContentProps) {
    const first = (ctx.node.metadata?.first as string | undefined) || "";
    const last = (ctx.node.metadata?.last as string | undefined) || "";
    const motion = (ctx.node.metadata?.motion as string | undefined) || "";
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!first.trim() || busy) return;
        setBusy(true);
        try {
            const r = await ctx.generateText(
                `首帧画面:${first.trim()}\n尾帧画面:${last.trim() || "与首帧相近,由你补全"}\n动作描述:${motion.trim() || "由你根据画面补全"}`,
                { system: SYSTEM },
            );
            if (r.text.trim()) set({ output: r.text.trim() });
        } catch (err) {
            set({ output: `⚠ 生成失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(output);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    const area = (val: string, ph: string, onch: (v: string) => void, rows: number) => (
        <textarea
            value={val}
            placeholder={ph}
            onChange={(e) => onch(e.target.value)}
            onWheel={stop}
            rows={rows}
            style={{ flexShrink: 0, resize: "none", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12, lineHeight: 1.5, boxSizing: "border-box" }}
        />
    );

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600 }}>① 首帧画面(中文)</div>
            {area(first, "如:「清晨厨房,女生背对镜头,窗外阳光」,留空则由 AI 补全", (v) => set({ first: v }), 2)}
            <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600 }}>② 尾帧画面(中文,可留空)</div>
            {area(last, "如:「她转过身,举起咖啡杯微笑」", (v) => set({ last: v }), 2)}
            <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600 }}>③ 动作描述(可留空)</div>
            {area(motion, "如:「缓慢转身,镜头轻微推进」", (v) => set({ motion: v }), 2)}
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={generate} disabled={busy || !first.trim()} style={primary}>
                    {busy ? "生成中…" : output ? "✨ 重新生成" : "✨ 生成提示词链"}
                </button>
                {output && !busy ? <button type="button" onClick={copy} style={btn}>{copied ? "已复制" : "复制"}</button> : null}
            </div>
            <textarea
                value={output}
                placeholder="FIRST / LAST / MOTION 三段英文提示词会出现在这里…"
                onChange={(e) => set({ output: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }}
            />
        </div>
    );
}

export default definePlugin({
    id: "prompt-chain",
    name: "首尾帧提示词链",
    version: "1.0.0",
    description: "首帧→尾帧→动作三段式输入,AI 生成首尾帧视频生成的完整英文提示词链",
    nodes: [
        {
            type: "prompt-chain:chain",
            title: "提示词链",
            icon: "🔗",
            description: "首尾帧视频提示词链:首帧/尾帧/动作 → FIRST/LAST/MOTION 三段英文",
            defaultSize: { width: 480, height: 540 },
            defaultMetadata: { first: "", last: "", motion: "", output: "" },
            minimapColor: "#f97316",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = node.metadata?.output as string | undefined;
                return text ? { kind: "text", text } : null;
            },
            Content: PromptChainContent,
        },
    ],
});
