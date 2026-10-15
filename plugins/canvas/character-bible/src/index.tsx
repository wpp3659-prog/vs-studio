// 角色圣经：把角色外观、服装、表演与英文生成描述固化，帮助跨镜头保持一致。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SYSTEM =
    "你是电影角色造型指导与角色连续性设计师。根据角色设定，写一份可执行的角色圣经，帮助多张 AI 图像/视频在不同镜头中维持同一角色。" +
    "必须包含：角色核心身份；不可漂移的脸部/发型/体态识别锚点（3-5项）；服装与配饰锁定；表情、姿态、惯常动作；角色弧光；镜头间允许变化与禁止变化；最后给一段可直接使用的英文角色一致性提示词。" +
    "不得擅自更改用户已给定的事实；缺失信息标为建议而非事实。中文分节输出，英文提示词单独放在最后。";

function CharacterBibleContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const style = (ctx.node.metadata?.style as string | undefined) || "电影写实";
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);
    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        try {
            const r = await ctx.generateText(`视觉方向：${style}\n角色资料：\n${brief.trim()}`, { system: SYSTEM });
            if (r.text.trim()) set({ output: r.text.trim() });
        } catch (e) { set({ output: `生成失败：${e instanceof Error ? e.message : String(e)}` }); }
        finally { setBusy(false); }
    };
    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: busy ? "wait" : "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <textarea value={brief} placeholder="角色姓名/年龄段/身份/性格/剧情功能/已确定的外观与服装；不确定的也可写出来" onChange={(e) => set({ brief: e.target.value })} onWheel={stop} rows={3} style={{ flexShrink: 0, resize: "vertical", padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 11, opacity: .7 }}>视觉方向</span>{["电影写实", "商业广告", "动画设计", "奇幻风格"].map((s) => <button key={s} onClick={() => set({ style: s })} style={{ ...btn, background: style === s ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{s}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><button onClick={generate} disabled={busy || !brief.trim()} style={primary}>{busy ? "整理中…" : output ? "重新生成角色圣经" : "生成角色圣经"}</button>{output && <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }}>{copied ? "已复制" : "复制全部"}</button>}</div>
        <textarea value={output} placeholder="生成结果会列出不可漂移的身份锚点、服装锁定与英文角色提示词，可继续手动编辑…" onChange={(e) => set({ output: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box" }} />
    </div>;
}

export default definePlugin({ id: "character-bible", name: "角色圣经", version: "1.0.0", description: "固定角色身份锚点、外观、服装与表演细节，生成跨镜头一致性设定和英文提示词", nodes: [{
    type: "character-bible:profile", title: "角色圣经", icon: "🧑‍🎤", description: "角色连续性档案：身份锚点 / 造型锁定 / 英文提示词", defaultSize: { width: 470, height: 520 }, defaultMetadata: { brief: "", style: "电影写实", output: "" }, minimapColor: "#8b5cf6", hidePanel: true, interactionToggle: true,
    resource: (node) => { const text = node.metadata?.output as string | undefined; return text ? { kind: "text", text } : null; }, Content: CharacterBibleContent,
}] });
