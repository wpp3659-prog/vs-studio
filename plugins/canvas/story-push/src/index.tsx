// 剧情推演：用文本模型把一个镜头拆成「前因 / 本镜 / 后果 / 收尾」，再推演同一场景的前后画面，用来降低抽卡次数。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const MODES = [
    { key: "four", label: "剧情四格", hint: "起 / 承 / 转 / 合四格关键画面" },
    { key: "before_after", label: "前后推演", hint: "本镜的前 3 秒与后 3 秒画面" },
    { key: "shot_flow", label: "镜头流", hint: "中景建立 → 近景推进 → 特写落点" },
] as const;

const SYSTEM =
    "你是影视分镜师。根据用户给的一场戏，输出可直接用于 AI 生图/生视频的分镜推演。" +
    "严格按要求输出表格，每行一个画面：序号、时间点、景别、画面内容、镜头运动、英文提示词。" +
    "英文提示词要包含人物外观、动作、场景、光线、景别、镜头语言，一行写完不要换行。" +
    "人物与场景描述必须在各格之间保持一致，只改变景别、机位、动作阶段。不要写解释性文字。";

const PROMPT: Record<string, string> = {
    four: "请把这一个镜头拆成四格关键画面（起、承、转、合），覆盖这段戏的开头、推进、转折、收尾。",
    before_after:
        "用户会提供本镜的画面。请推演两个画面：本镜之前 3 秒（人物与镜头在做什么，怎么走到当前状态），以及本镜之后 3 秒（动作如何延续或反转）。" +
        "第一格写「前 3 秒」，第二格写「当前」，第三格写「后 3 秒」。",
    shot_flow: "请把这场戏拆成三镜：中景建立空间与人物关系 → 近景推进情绪 → 特写落在最关键的动作或眼神。",
};

function StoryPushContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const mode = (ctx.node.metadata?.mode as string | undefined) || "four";
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try {
            const upstream = ctx.getUpstream();
            const context = upstream
                .map((n) => (n.metadata?.content as string | undefined) || (n.metadata?.output as string | undefined) || "")
                .filter(Boolean)
                .join("\n")
                .slice(0, 2000);
            const r = await ctx.generateText(`${PROMPT[mode] || PROMPT.four}\n\n场景与剧情：\n${brief.trim()}${context ? `\n\n上游参考：\n${context}` : ""}`, { system: SYSTEM });
            if (r.text.trim()) set({ output: r.text.trim() });
        } catch (e) {
            set({ output: `生成失败：${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setBusy(false);
        }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy || !brief.trim() ? 0.6 : 1 } as const;

    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>{ctx.renderPromptInput({ value: brief, onChange: (v) => set({ brief: v }), placeholder: "这场戏的剧情：谁、在哪、想做什么、遇到什么阻碍；也可 @ 引用上游分镜或剧本", style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 60, maxHeight: 130 } })}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>{MODES.map((m) => <button key={m.key} title={m.hint} onClick={() => set({ mode: m.key })} style={{ ...btn, background: mode === m.key ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{m.label}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={generate} disabled={busy || !brief.trim()} style={primary}>{busy ? "推演中…" : output ? "重新推演" : "开始推演"}</button>
            {output ? <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制"}</button> : null}
        </div>
        <textarea value={output} placeholder="推演结果是一张分镜表：序号 / 时间点 / 景别 / 画面 / 运镜 / 英文提示词。可直接复制到生图节点，或另存为分镜表。" onChange={(e) => set({ output: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
    </div>;
}

export default definePlugin({
    id: "story-push",
    name: "剧情推演",
    version: "1.0.0",
    description: "一个镜头推演出四格剧情、前后画面或三镜流程，先排走位再生成，减少抽卡",
    nodes: [{
        type: "story-push:flow",
        title: "剧情推演",
        icon: "🎞",
        description: "剧情四格 / 前后画面推演 / 三镜流程，附英文提示词",
        defaultSize: { width: 470, height: 520 },
        defaultMetadata: { brief: "", mode: "four", output: "" },
        minimapColor: "#f59e0b",
        hidePanel: true,
        interactionToggle: true,
        resource: (node) => {
            const text = node.metadata?.output as string | undefined;
            return text ? { kind: "text", text } : null;
        },
        Content: StoryPushContent,
    }],
});
