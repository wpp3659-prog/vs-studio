// 连戏检查器：针对输入的镜头序列，审查画面方向、视线、服装、道具、光线与动作接续。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SYSTEM =
    "你是电影场记与剪辑连续性主管。审查用户给出的分镜/镜头序列，找出可能的连戏风险。" +
    "逐项检查：180度轴线和屏幕方向；人物视线/视线匹配；动作匹配与手脚位置；服装、发型、妆面和污渍；道具所在手/位置/状态；场景空间与出入口；时间、天气、光线方向/色温；镜头景别与剪辑跳切。" +
    "只报告输入内容能支持的判断，分清【明确矛盾】【需要确认】【合理变化】；每条引用镜号/原文证据，写严重度、风险、建议修正。结尾给拍摄/生成前的优先修正清单。" +
    "若信息不足以判断，明确指出缺了什么，不要编造连续性事实。中文结构化输出。";
function ContinuityContent({ ctx }: CanvasNodeContentProps) {
    const sequence = (ctx.node.metadata?.sequence as string | undefined) || "";
    const result = (ctx.node.metadata?.result as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);
    const run = async () => { if (!sequence.trim() || busy) return; setBusy(true); try { const r = await ctx.generateText(sequence.trim(), { system: SYSTEM }); if (r.text.trim()) set({ result: r.text.trim() }); } catch (e) { set({ result: `检查失败：${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); } };
    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <div style={{ flexShrink: 0, fontSize: 11, opacity: .75 }}>逐镜编号粘贴；写得越具体，检查越可靠。AI 提醒需人工核对，不替代现场场记。</div>
        <textarea value={sequence} placeholder="镜头 1：她右手拿杯，面向画面右侧，窗光从左后方来…\n镜头 2：……\n可粘贴角色圣经、场景圣经或分镜表内容。" onChange={(e) => set({ sequence: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 90, resize: "none", padding: 9, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><button onClick={run} disabled={busy || !sequence.trim()} style={primary}>{busy ? "核对中…" : "检查连续性"}</button>{result && <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制报告"}</button>}</div>
        <textarea value={result} placeholder="检查报告会分为明确矛盾、需要确认、合理变化，并附证据和建议…" onChange={(e) => set({ result: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 90, resize: "none", padding: 9, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }} />
    </div>;
}
export default definePlugin({ id: "continuity-checker", name: "连戏连续性检查", version: "1.0.0", description: "检查分镜之间的轴线、视线、动作、服装、道具、场景与光线连续性，引用证据并区分风险与待确认项", nodes: [{ type: "continuity-checker:review", title: "连戏检查", icon: "🧷", description: "分镜序列连续性风险审查", defaultSize: { width: 490, height: 560 }, defaultMetadata: { sequence: "", result: "" }, minimapColor: "#ef4444", hidePanel: true, interactionToggle: true, resource: (node) => { const text = node.metadata?.result as string | undefined; return text ? { kind: "text", text } : null; }, Content: ContinuityContent }] });
