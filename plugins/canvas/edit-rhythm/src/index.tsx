// 剪辑节奏规划：按成片时长把旁白/创意拆成时间码、画面节拍、声音与转场建议。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SYSTEM =
    "你是资深广告剪辑师与节奏设计师。根据素材/旁白/创意和指定时长，输出一份可交给剪辑师执行的 timecoded edit map。" +
    "先给节奏曲线（开场钩子→建立→推进→转折/情绪峰值→品牌落点/收束）；再按时间码逐段列：时间范围、画面/景别变化、剪辑节奏与转场、音乐/音效进入点、旁白/字幕、该段目的。" +
    "时间段必须连续、不重叠、覆盖全片且总和精确匹配目标时长；短广告前3秒要有钩子，品牌/CTA预留可读时长。" +
    "不要臆造实际素材；素材未提供时写镜头建议。中文输出，时间码格式 mm:ss。";
const STYLES = ["快节奏冲击", "情绪递进", "高级克制", "悬念蓄势", "轻松生活流"];
function EditRhythmContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const duration = (ctx.node.metadata?.duration as number | undefined) ?? 30;
    const style = (ctx.node.metadata?.style as string | undefined) || STYLES[0];
    const result = (ctx.node.metadata?.result as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);
    const generate = async () => { if (!brief.trim() || busy) return; setBusy(true); try { const r = await ctx.generateText(`目标时长：${duration} 秒\n节奏方向：${style}\n旁白/素材/创意说明：\n${brief.trim()}`, { system: SYSTEM }); if (r.text.trim()) set({ result: r.text.trim() }); } catch (e) { set({ result: `规划失败：${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); } };
    const btn = { padding: "4px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 11 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <textarea value={brief} placeholder="粘贴旁白稿、分镜梗概或现有素材描述；标注品牌/CTA必须出现的内容。" onChange={(e) => set({ brief: e.target.value })} onWheel={stop} rows={4} style={{ flexShrink: 0, resize: "vertical", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 10.5, opacity: .7 }}>成片</span>{[15, 30, 60, 90].map((n) => <button key={n} onClick={() => set({ duration: n })} style={{ ...btn, background: duration === n ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{n}s</button>)}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{STYLES.map((s) => <button key={s} onClick={() => set({ style: s })} style={{ ...btn, background: style === s ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{s}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><button onClick={generate} disabled={busy || !brief.trim()} style={primary}>{busy ? "编排中…" : "生成剪辑节奏表"}</button>{result && <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制"}</button>}</div>
        <textarea value={result} placeholder="输出带时间码的段落表：画面、剪辑点、旁白/字幕、音乐音效与段落目的…" onChange={(e) => set({ result: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }} />
    </div>;
}
export default definePlugin({ id: "edit-rhythm", name: "剪辑节奏规划器", version: "1.0.0", description: "按目标时长生成精确时间码剪辑节奏表：画面、转场、旁白、音乐音效与品牌落点", nodes: [{ type: "edit-rhythm:timeline", title: "剪辑节奏", icon: "⏱", description: "创意/旁白 → 带时间码的剪辑节奏图", defaultSize: { width: 480, height: 550 }, defaultMetadata: { brief: "", duration: 30, style: STYLES[0], result: "" }, minimapColor: "#f97316", hidePanel: true, interactionToggle: true, resource: (node) => { const text = node.metadata?.result as string | undefined; return text ? { kind: "text", text } : null; }, Content: EditRhythmContent }] });
