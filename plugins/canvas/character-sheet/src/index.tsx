// 角色三视图：一次出「正面/侧面/背面」设定图，作为跨镜头的角色一致性锚点。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const VIEWS = [
    { key: "turnaround", label: "三视图", prompt: "character turnaround sheet, full body, standing straight, same character shown three times: front view, side view, back view, side by side, neutral pose, plain light grey background, even studio lighting, no text, no props" },
    { key: "quad", label: "四视图", prompt: "character reference sheet, full body, same character shown four times: front view, left side view, back view, three-quarter view, side by side, neutral pose, plain light grey background, even studio lighting, no text" },
    { key: "expression", label: "表情九宫格", prompt: "character expression sheet, bust shot, same character in a 3x3 grid showing nine different facial expressions, consistent hair and outfit, plain background, even lighting, no text" },
] as const;

const STYLES = ["电影写实", "商业广告", "二次元", "3D 渲染", "国风写意"] as const;

function CharacterSheetContent({ ctx }: CanvasNodeContentProps) {
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const style = (ctx.node.metadata?.style as string | undefined) || "电影写实";
    const view = (ctx.node.metadata?.view as string | undefined) || "turnaround";
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    const generate = async () => {
        if (!brief.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
            // 上游连了图就当作参考图走编辑，保证人物长相延续；否则纯文生图。
            const upstream = ctx.getUpstream().flatMap((n) => (n.metadata?.images || []).map((i) => i.content)).filter(Boolean).slice(0, 3);
            const preset = VIEWS.find((v) => v.key === view) || VIEWS[0];
            // 先让文本模型把用户设定压缩成稳定的英文外观描述，再交给生图，减少漂移。
            let look = brief.trim();
            try {
                const r = await ctx.generateText(
                    `角色设定：${brief.trim()}\n视觉方向：${style}\n请输出一句英文的角色外观描述，只描述不可变特征：年龄段、性别、脸型、发型发色、瞳色、体型、服装主色与配饰。不要写镜头、光线、背景、动作。不超过 60 个单词。`,
                    { system: "你是角色设定师。只输出一句英文外观描述，不要任何解释、前缀或引号。" },
                );
                if (r.text.trim()) look = r.text.trim();
            } catch {
                // 文本模型不可用时直接用原始设定，不阻塞出图。
            }
            const prompt = `${look}, ${preset.prompt}, ${style === "电影写实" ? "photorealistic" : style === "二次元" ? "anime style" : style === "3D 渲染" ? "3d render, pixar style" : style === "国风写意" ? "traditional chinese painting style" : "commercial advertising photography"}`;
            const { images } = await ctx.ai.generateImage(prompt, { count: 1, size: "1536x1024", references: upstream });
            if (images.length) set({ output: images[0] });
            else setError("没有拿到图片，请检查模型配置后重试。");
        } catch (e) {
            setError(`生成失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy || !brief.trim() ? 0.6 : 1 } as const;

    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>{ctx.renderPromptInput({ value: brief, onChange: (v) => set({ brief: v }), placeholder: "角色设定：姓名/年龄/性别/职业/性格/服装与标志性特征；也可 @ 引用上游角色设定或已生成的人物图", style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 60, maxHeight: 130 } })}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>{VIEWS.map((v) => <button key={v.key} onClick={() => set({ view: v.key })} style={{ ...btn, background: view === v.key ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{v.label}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}><span style={{ fontSize: 11, opacity: 0.7 }}>画风</span>{STYLES.map((s) => <button key={s} onClick={() => set({ style: s })} style={{ ...btn, background: style === s ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, fontSize: 11 }}>{s}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><button onClick={generate} disabled={busy || !brief.trim()} style={primary}>{busy ? "生成中…" : output ? "换一张" : "生成三视图"}</button></div>
        {error ? <div style={{ fontSize: 11, color: "#ef4444", flexShrink: 0 }}>{error}</div> : null}
        <div style={{ flex: 1, minHeight: 0, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, display: "grid", placeItems: "center", overflow: "hidden" }}>
            {output ? <img src={output} alt="角色设定图" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 12, opacity: 0.55, padding: 12, textAlign: "center" }}>设定图会出现在这里。三视图可直接拖到其它节点当参考图，保证多镜头同一个人。</span>}
        </div>
    </div>;
}

export default definePlugin({
    id: "character-sheet",
    name: "角色三视图",
    version: "1.0.0",
    description: "一次生成正面/侧面/背面角色设定图，作为跨镜头一致性锚点，支持表情九宫格",
    nodes: [{
        type: "character-sheet:views",
        title: "角色三视图",
        icon: "🧍",
        description: "三视图/四视图/表情九宫格设定图，跨镜头保持同一角色",
        defaultSize: { width: 480, height: 560 },
        defaultMetadata: { brief: "", style: "电影写实", view: "turnaround", output: "" },
        minimapColor: "#14b8a6",
        hidePanel: true,
        interactionToggle: true,
        resource: (node) => {
            const url = node.metadata?.output as string | undefined;
            return url ? { kind: "image", url, previewUrl: url, title: node.title } : null;
        },
        Content: CharacterSheetContent,
        toolbar: (ctx) => [{
            id: "to-image-node",
            title: "把设定图复制到画布",
            label: "复制到画布",
            icon: "📋",
            onClick: () => {
                const url = ctx.node.metadata?.output as string | undefined;
                if (!url) return;
                ctx.applyOps([{ type: "add_node", nodeType: "image", title: `${ctx.node.title} 设定图`, position: { x: ctx.node.position.x + ctx.node.width + 40, y: ctx.node.position.y }, width: 420, height: 320, metadata: { images: [{ id: `sheet-${Date.now()}`, status: "success", content: url, naturalWidth: 1536, naturalHeight: 1024, bytes: 0, mimeType: "image/png" }] } }]);
            },
        }],
    }],
});
