// 提示词模板库:把常用提示词存成模板,{{变量}} 填空复用,一键替换并复制。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Template = { id: number; name: string; body: string };

function normalize(raw: unknown): Template[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((it, i) => ({ id: Number((it as Template).id) || i + 1, name: String((it as Template).name ?? ""), body: String((it as Template).body ?? "") }));
}

function vars(body: string): string[] {
    return [...new Set([...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim()).filter(Boolean))];
}

const DEFAULTS: Template[] = [
    { id: 1, name: "产品 TVC 镜头", body: "{{product}} on a {{surface}}, studio lighting, slow dolly in, macro detail, photorealistic commercial photography, 16:9" },
    { id: 2, name: "城市夜景人物", body: "{{subject}} standing in neon-lit {{city}} street at night, rain reflections, Wong Kar-wai style, cinematic film still, 35mm" },
];

function TemplateContent({ ctx }: CanvasNodeContentProps) {
    const templates = normalize(ctx.node.metadata?.templates?.length ? ctx.node.metadata.templates : DEFAULTS);
    const setTemplates = (next: Template[]) => ctx.updateMetadata({ templates: next });
    const activeId = Number(ctx.node.metadata?.activeId) || 0;
    const active = templates.find((t) => t.id === activeId);
    const values = (ctx.node.metadata?.varValues || {}) as Record<string, string>;
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState("");
    const [draftBody, setDraftBody] = useState("");
    const [copied, setCopied] = useState(false);

    const vs = active ? vars(active.body) : [];
    const filled = active ? active.body.replace(/\{\{([^}]+)\}\}/g, (_, k) => values[k.trim()]?.trim() ? values[k.trim()] : `{{${k.trim()}}}`) : "";

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(filled);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {templates.map((t) => (
                    <button key={t.id} type="button" title={t.body} onClick={() => ctx.updateMetadata({ activeId: t.id, varValues: {} })} style={{ ...btn, fontSize: 11, padding: "3px 9px", background: t.id === activeId ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: t.id === activeId ? "#6366f1" : ctx.theme.node.stroke }}>
                        {t.name || "未命名"}
                    </button>
                ))}
                <button type="button" onClick={() => setCreating((v) => !v)} style={{ ...btn, fontSize: 11, padding: "3px 9px" }}>➕ 新建</button>
            </div>
            {creating ? (
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}` }}>
                    <input value={draftName} placeholder="模板名,如「汽车广告镜头」" onChange={(e) => setDraftName(e.target.value)} onWheel={stop} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
                    <textarea value={draftBody} placeholder="提示词内容,用 {{主体}} {{场景}} 这类变量占位…" rows={3} onChange={(e) => setDraftBody(e.target.value)} onWheel={stop} style={{ resize: "vertical", padding: 8, borderRadius: 6, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12, boxSizing: "border-box", lineHeight: 1.5 }} />
                    <button type="button" onClick={() => { if (!draftBody.trim()) return; setTemplates([...templates, { id: Date.now(), name: draftName.trim() || "未命名", body: draftBody.trim() }]); setCreating(false); setDraftName(""); setDraftBody(""); }} style={{ ...btn, alignSelf: "flex-start" }}>
                        保存模板
                    </button>
                </div>
            ) : null}
            {active ? (
                <>
                    <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {vs.map((v) => (
                            <input key={v} value={values[v] || ""} placeholder={v} onChange={(e) => ctx.updateMetadata({ varValues: { ...values, [v]: e.target.value } })} onWheel={stop} style={{ width: 110, padding: "4px 8px", borderRadius: 6, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 11 }} />
                        ))}
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10, borderRadius: 8, background: ctx.theme.toolbar.panel, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "Consolas, Menlo, monospace" }}>{filled}</div>
                    <button type="button" onClick={copy} style={{ ...btn, flexShrink: 0, alignSelf: "flex-start" }}>{copied ? "已复制" : "复制填充结果"}</button>
                </>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点一个模板开始填空;「➕ 新建」把你的常用提示词存起来</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "prompt-template",
    name: "提示词模板库",
    version: "1.0.0",
    description: "把常用提示词存成 {{变量}} 模板,填空复用一键复制",
    nodes: [
        {
            type: "prompt-template:library",
            title: "提示词模板",
            icon: "🏷",
            description: "提示词模板与变量填空",
            defaultSize: { width: 420, height: 380 },
            defaultMetadata: { templates: DEFAULTS, activeId: 0, varValues: {} },
            minimapColor: "#0891b2",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const templates = normalize(node.metadata?.templates?.length ? node.metadata.templates : DEFAULTS);
                const active = templates.find((t) => t.id === Number(node.metadata?.activeId));
                return active ? { kind: "text", text: active.body } : null;
            },
            Content: TemplateContent,
        },
    ],
});
