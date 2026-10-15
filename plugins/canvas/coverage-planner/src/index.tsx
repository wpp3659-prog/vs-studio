// 镜头覆盖规划：把一场戏规划为可剪辑的主镜头、正反打、单人镜头、插入与反应镜头。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SYSTEM =
    "你是电影摄影指导与剪辑师。为一场戏设计可拍、可剪的镜头覆盖方案，不要只把剧本逐句拆镜。" +
    "先判断戏的核心冲突与视线关系；规划建立镜头/主镜头、双人镜头、过肩正反打、单人近景、反应镜头、关键道具插入、必要的空镜或剪辑保险镜头。" +
    "每镜输出：镜号｜景别/机位｜画面调度与演员视线｜镜头运动｜剪辑用途｜英文视觉提示词。明确 180 度轴线、屏幕方向与可否越轴；避免不必要的重复覆盖。若 brief 不适合某种镜头，说明原因。" +
    "中文方案，英文提示词保留英文；用户未提供的信息写成建议，不要假装已知。";
function CoverageContent({ ctx }: CanvasNodeContentProps) {
    const scene = (ctx.node.metadata?.scene as string | undefined) || "";
    const count = (ctx.node.metadata?.count as number | undefined) ?? 8;
    const result = (ctx.node.metadata?.result as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);
    const generate = async () => { if (!scene.trim() || busy) return; setBusy(true); try { const r = await ctx.generateText(`期望镜头数量：约 ${count} 个\n场景/剧本：\n${scene.trim()}`, { system: SYSTEM }); if (r.text.trim()) set({ result: r.text.trim() }); } catch (e) { set({ result: `规划失败：${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); } };
    const btn = { padding: "4px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 11.5 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <textarea value={scene} placeholder="粘贴一场戏的剧本或梗概，并写明人物关系、场景布局、情绪变化。不要只写一句主题。" onChange={(e) => set({ scene: e.target.value })} onWheel={stop} rows={4} style={{ flexShrink: 0, resize: "vertical", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 11, opacity: .7 }}>镜头规模</span>{[6, 8, 12, 16].map((n) => <button key={n} onClick={() => set({ count: n })} style={{ ...btn, background: count === n ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{n} 镜</button>)}<button onClick={generate} disabled={busy || !scene.trim()} style={primary}>{busy ? "规划中…" : "生成覆盖方案"}</button>{result && <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制方案"}</button>}</div>
        <textarea value={result} placeholder="方案会按镜头列出景别、调度、剪辑用途、轴线规则与英文画面提示词…" onChange={(e) => set({ result: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }} />
    </div>;
}
export default definePlugin({ id: "coverage-planner", name: "镜头覆盖规划器", version: "1.0.0", description: "把一场戏规划为主镜头/双人/正反打/单人/反应/插入与剪辑保险镜头，并检查轴线与视线", nodes: [{ type: "coverage-planner:plan", title: "覆盖规划", icon: "🎬", description: "场景剧本 → 可剪辑的镜头覆盖方案", defaultSize: { width: 490, height: 540 }, defaultMetadata: { scene: "", count: 8, result: "" }, minimapColor: "#f97316", hidePanel: true, interactionToggle: true, resource: (node) => { const text = node.metadata?.result as string | undefined; return text ? { kind: "text", text } : null; }, Content: CoverageContent }] });
