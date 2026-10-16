// 剧本工坊:输入创意 brief,选形式与时长,AI 生成分场剧本(场景/画面/台词/时长)。
// 走宿主 ctx.generateText(用你配置的文本模型),结果可编辑、可复制、可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const FORMS = ["TVC 广告 15s", "TVC 广告 30s", "TVC 广告 60s", "短视频 30s", "短视频 60s", "微电影 3min", "品牌宣传片 90s", "预告片 60s"];

const SYSTEM =
    "你是资深影视编剧兼广告导演。根据用户的创意 brief 和成片形式,写一份可执行的中文分场剧本。" +
    "格式:按镜头编号(镜头1、镜头2…),每镜包含【画面】【景别/运镜】【台词/旁白】【时长】。" +
    "总时长必须匹配给定形式;TVC 要有明确的 hook-展开-收尾结构,结尾落到品牌记忆点。直接输出剧本,不要解释。";

function ScriptStudioContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const form = (ctx.node.metadata?.form as string | undefined) || FORMS[0];
    const script = (ctx.node.metadata?.script as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try {
            const result = await ctx.generateText(`成片形式:${form}\n创意 brief:${brief.trim()}\n请写分场剧本。`, { system: SYSTEM });
            if (result.text.trim()) set({ script: result.text.trim() });
        } catch (err) {
            set({ script: `⚠ 生成失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    const rewrite = async (mode: "更紧凑" | "更有情绪" | "更商业") => {
        if (!script.trim() || busy) return;
        setBusy(true);
        try {
            const result = await ctx.generateText(`请把下面这份分场剧本改写得更${mode},保持同样的镜头格式输出:\n\n${script}`, { system: SYSTEM });
            if (result.text.trim()) set({ script: result.text.trim() });
        } catch (err) {
            set({ script: `⚠ 改写失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(script);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0 }}>
                {ctx.renderPromptInput({
                    value: brief,
                    onChange: (v) => set({ brief: v }),
                    placeholder: "一句话创意,如:「咖啡品牌,都市白领清晨第一口,治愈感」;也可用 @ 引用上游文字节点",
                    style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 52, maxHeight: 140 },
                })}
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {FORMS.map((f) => (
                    <button key={f} type="button" onClick={() => set({ form: f })} style={{ ...btn, fontSize: 11, padding: "3px 8px", background: f === form ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: f === form ? "#6366f1" : ctx.theme.node.stroke }}>
                        {f}
                    </button>
                ))}
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={generate} disabled={busy || !brief.trim()} style={primary}>
                    {busy ? "生成中…" : script ? "✨ 重新生成" : "✨ 生成剧本"}
                </button>
                {script && !busy ? (
                    <>
                        <button type="button" onClick={() => rewrite("更紧凑")} style={btn}>更紧凑</button>
                        <button type="button" onClick={() => rewrite("更有情绪")} style={btn}>更有情绪</button>
                        <button type="button" onClick={() => rewrite("更商业")} style={btn}>更商业</button>
                        <button type="button" onClick={copy} style={btn}>{copied ? "已复制" : "复制"}</button>
                    </>
                ) : null}
            </div>
            <textarea
                value={script}
                placeholder="生成的分场剧本出现在这里,可直接编辑…"
                onChange={(e) => set({ script: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }}
            />
        </div>
    );
}

export default definePlugin({
    id: "script-studio",
    name: "剧本工坊",
    version: "1.1.0",
    description: "AI 剧本创作:创意 brief + 成片形式 → 分场剧本,支持多风格改写与复制",
    nodes: [
        {
            type: "script-studio:writer",
            title: "剧本",
            icon: "📜",
            description: "AI 分场剧本创作",
            defaultSize: { width: 460, height: 460 },
            defaultMetadata: { brief: "", form: FORMS[0], script: "" },
            minimapColor: "#f97316",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = node.metadata?.script as string | undefined;
                return text ? { kind: "text", text } : null;
            },
            Content: ScriptStudioContent,
        },
    ],
});
