// 旁白配音稿:输入主题与总秒数,AI 写旁白;实时校验字数是否配得上语速。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const SYSTEM =
    "你是资深广告文案兼配音撰稿人。根据主题与总时长写中文旁白配音稿。" +
    "中文配音语速约每秒 4 个字,旁白总字数必须落在给定时长的合理区间(允许 ±10%)。" +
    "按 [0-3s] [3-8s] 这类时间段分段标注,句式短促有画面感,适配口播。直接输出旁白稿,不要解释。";

function VoScriptContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const seconds = (ctx.node.metadata?.seconds as number | undefined) ?? 30;
    const script = (ctx.node.metadata?.script as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try {
            const r = await ctx.generateText(`主题:${brief.trim()}\n总时长:${seconds} 秒`, { system: SYSTEM });
            if (r.text.trim()) set({ script: r.text.trim() });
        } catch (err) {
            set({ script: `⚠ 生成失败:${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setBusy(false);
        }
    };

    // 中文配音:按 4 字/秒;英文字符按 0.5 字计
    const chars = [...script.replace(/\[[^\]]*\]/g, "")].reduce((n, c) => n + (/[a-zA-Z0-9]/.test(c) ? 0.5 : /\s/.test(c) ? 0 : 1), 0);
    const ideal = seconds * 4;
    const ratio = ideal > 0 ? chars / ideal : 0;
    const verdict = script.trim() === "" ? null : ratio > 1.15 ? `偏长 ${Math.round((ratio - 1) * 100)}%,语速会赶` : ratio < 0.85 ? `偏短 ${Math.round((1 - ratio) * 100)}%,有留白` : "字数合适 ✓";

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0 }}>
                {ctx.renderPromptInput({
                    value: brief,
                    onChange: (v) => set({ brief: v }),
                    placeholder: "旁白主题,如:「新品香氛蜡烛,夜晚独处的仪式感」;也可用 @ 引用上游剧本/文字节点",
                    style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 52, maxHeight: 140 },
                })}
            </div>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>总时长</span>
                {[10, 15, 30, 60, 90].map((s) => (
                    <button key={s} type="button" onClick={() => set({ seconds: s })} style={{ ...btn, fontSize: 11, padding: "3px 8px", background: s === seconds ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: s === seconds ? "#6366f1" : ctx.theme.node.stroke }}>
                        {s}s
                    </button>
                ))}
                <span style={{ fontSize: 11, opacity: 0.6 }}>约 {seconds * 4} 字</span>
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={generate} disabled={busy || !brief.trim()} style={primary}>
                    {busy ? "撰写中…" : script ? "✨ 重写" : "✨ 写配音稿"}
                </button>
                {script && !busy ? (
                    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(script); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }} style={btn}>{copied ? "已复制" : "复制"}</button>
                ) : null}
                {verdict ? <span style={{ fontSize: 11, opacity: 0.85, background: "rgba(99,102,241,.12)", padding: "3px 8px", borderRadius: 8 }}>共 {Math.round(chars)} 字 · {verdict}</span> : null}
            </div>
            <textarea
                value={script}
                placeholder="配音稿会出现在这里,带时间段标注,可直接编辑…"
                onChange={(e) => set({ script: e.target.value })}
                onWheel={stop}
                style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }}
            />
        </div>
    );
}

export default definePlugin({
    id: "vo-script",
    name: "旁白配音稿",
    version: "1.1.0",
    description: "AI 按主题与总秒数写中文旁白稿,带时间段标注与字数/语速校验",
    nodes: [
        {
            type: "vo-script:writer",
            title: "配音稿",
            icon: "🎙",
            description: "AI 旁白配音稿:主题+时长 → 分段旁白,字数语速自动校验",
            defaultSize: { width: 470, height: 480 },
            defaultMetadata: { brief: "", seconds: 30, script: "" },
            minimapColor: "#f97316",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = node.metadata?.script as string | undefined;
                return text ? { kind: "text", text } : null;
            },
            Content: VoScriptContent,
        },
    ],
});
