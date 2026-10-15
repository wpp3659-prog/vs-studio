// AI 分镜自动化:输入创意 brief + 镜头数,AI 产出逐镜分镜(景别/画面/英文提示词)。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const SYSTEM =
    "你是资深分镜师。根据用户的创意 brief 和镜头数,输出逐镜分镜表。" +
    "格式严格如下,每个镜头一段:「镜头N」开头,内含三行:" +
    "景别/运镜:xxx;画面:中文画面描述(含人物动作、场景、光线);" +
    "提示词:one polished English image/video prompt for this shot, 40-80 words。" +
    "镜头之间有明确叙事递进,总时长按每镜 3-5 秒估算。直接输出,不要解释。";

function StoryboardContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const count = (ctx.node.metadata?.count as number | undefined) ?? 6;
    const result = (ctx.node.metadata?.result as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try {
            const r = await ctx.generateText(`创意 brief:${brief.trim()}\n镜头数:${count} 个`, { system: SYSTEM });
            if (r.text.trim()) set({ result: r.text.trim() });
        } catch (err) {
            set({ result: `⚠ 生成失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    // 只复制全部英文提示词(行以"提示词:"开头)
    const copyPrompts = async () => {
        const prompts = result
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("提示词:"))
            .map((l) => l.slice(4).trim())
            .join("\n\n");
        if (!prompts) return;
        try {
            await navigator.clipboard.writeText(prompts);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    const hasPrompts = result.split("\n").some((l) => l.trim().startsWith("提示词:"));

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <textarea
                value={brief}
                placeholder="创意 brief,如:「运动饮料,夏天球场,汗水和胜利」"
                onChange={(e) => set({ brief: e.target.value })}
                onWheel={stop}
                rows={2}
                style={{ flexShrink: 0, resize: "none", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12, lineHeight: 1.5, boxSizing: "border-box" }}
            />
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>镜头数</span>
                {[4, 6, 8, 10, 12].map((n) => (
                    <button key={n} type="button" onClick={() => set({ count: n })} style={{ ...btn, fontSize: 11, padding: "3px 8px", background: n === count ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: n === count ? "#6366f1" : ctx.theme.node.stroke }}>
                        {n}
                    </button>
                ))}
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={generate} disabled={busy || !brief.trim()} style={primary}>
                    {busy ? "分镜生成中…" : result ? "✨ 重新生成" : "✨ 生成分镜"}
                </button>
                {hasPrompts && !busy ? (
                    <button type="button" onClick={copyPrompts} style={btn}>{copied ? "已复制" : "复制全部英文提示词"}</button>
                ) : null}
            </div>
            <textarea
                value={result}
                placeholder="分镜表会出现在这里:每个镜头含 景别/画面/英文提示词,可直接编辑…"
                onChange={(e) => set({ result: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }}
            />
        </div>
    );
}

export default definePlugin({
    id: "ai-storyboard",
    name: "AI 分镜自动化",
    version: "1.0.0",
    description: "输入创意 brief + 镜头数,AI 生成逐镜分镜表(景别/画面/英文提示词),一键复制全部提示词",
    nodes: [
        {
            type: "ai-storyboard:board",
            title: "AI 分镜",
            icon: "🎞",
            description: "AI 自动分镜:brief → 逐镜景别/画面/英文提示词",
            defaultSize: { width: 480, height: 500 },
            defaultMetadata: { brief: "", count: 6, result: "" },
            minimapColor: "#f97316",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = node.metadata?.result as string | undefined;
                return text ? { kind: "text", text } : null;
            },
            Content: StoryboardContent,
        },
    ],
});
