// 场景圣经：固化场景空间关系、固定陈设、光源方向与视觉锚点，供跨镜复用。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SYSTEM =
    "你是电影美术指导、置景师与场景连续性主管。根据 brief 编写可复用的场景圣经，供跨镜头、跨画幅生成同一地点。" +
    "分节输出：场景身份/年代与天气；空间平面关系（入口、窗、主行动区、背景层）；固定视觉锚点（至少5项）；固定陈设与可变道具；主光源方向、色温、时间变化；材质和色彩；镜头间绝不能改变的连续性规则；最后输出一段可复制的英文环境提示词。" +
    "不把推测写成已知事实，缺项标注为建议；中文分节，英文提示词置于末尾。";

function SceneBibleContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);
    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try { const r = await ctx.generateText(brief.trim(), { system: SYSTEM }); if (r.text.trim()) set({ output: r.text.trim() }); }
        catch (e) { set({ output: `生成失败：${e instanceof Error ? e.message : String(e)}` }); }
        finally { setBusy(false); }
    };
    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <textarea value={brief} placeholder="描述地点、年代、时间、情绪、人物行动和已确定的空间/道具细节。例如：老公寓厨房，清晨，窗在画面左侧…" onChange={(e) => set({ brief: e.target.value })} onWheel={stop} rows={4} style={{ flexShrink: 0, resize: "vertical", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><button onClick={generate} disabled={busy || !brief.trim()} style={primary}>{busy ? "整理场景中…" : output ? "重新生成场景圣经" : "生成场景圣经"}</button>{output && <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制全部"}</button>}</div>
        <textarea value={output} placeholder="场景空间图谱、固定陈设、光线和连续性规则会出现在这里…" onChange={(e) => set({ output: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }} />
    </div>;
}

export default definePlugin({ id: "scene-bible", name: "场景圣经", version: "1.0.0", description: "锁定地点空间关系、视觉锚点、固定陈设和主光方向，辅助跨镜头场景一致", nodes: [{
    type: "scene-bible:profile", title: "场景圣经", icon: "🏠", description: "场景连续性档案：空间 / 陈设 / 光线 / 英文环境提示词", defaultSize: { width: 470, height: 520 }, defaultMetadata: { brief: "", output: "" }, minimapColor: "#0ea5e9", hidePanel: true, interactionToggle: true,
    resource: (node) => { const text = node.metadata?.output as string | undefined; return text ? { kind: "text", text } : null; }, Content: SceneBibleContent,
}] });
