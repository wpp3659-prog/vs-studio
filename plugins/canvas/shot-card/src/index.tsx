// 镜头提示词卡:面向生图/生视频的单镜头提示词组装器。
// 中文描述 + 英文风格芯片(光线/运镜/风格/画幅) → 一键 AI 转写为英文生成提示词 → 复制。
// AI 转写走宿主 ctx.generateText(用你已配置的文本模型),无需额外密钥。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Fields = {
    subject: string; // 主体:谁/什么
    scene: string; // 场景:在哪里/环境
    action: string; // 动作:在做什么
    lighting: string; // 光线(英文芯片)
    camera: string; // 运镜/景别(英文芯片)
    style: string; // 风格(英文芯片)
    ratio: string; // 画幅
};

const LIGHTING = ["golden hour light", "soft studio softbox", "dramatic rim light", "neon night glow", "candlelight warmth", "overcast natural light", "hard noon sunlight", "moody chiaroscuro"];
const CAMERA = ["extreme wide shot", "wide shot", "medium shot", "close-up", "extreme close-up", "dolly in", "handheld tracking", "aerial drone view", "low angle", "slow motion"];
const STYLE = ["cinematic film still, 35mm, shallow depth of field", "photorealistic commercial photography", "anime key visual", "3D render, octane, soft global illumination", "vintage film grain, kodak portra", "high fashion editorial"];
const RATIOS = ["16:9", "9:16", "1:1", "2.39:1", "4:5"];

const COMPOSE_SYSTEM =
    "You are a professional prompt engineer for AI image/video generation (Midjourney, Runway, Kling, Veo). " +
    "Given a Chinese shot description plus English modifier chips, output ONE polished English prompt, comma-separated, no explanations, no quotes, no markdown. " +
    "Keep it 60-120 words, front-load subject and action, then environment, lighting, camera, style.";

function Chip({ label, active, onClick, theme }: { label: string; active: boolean; onClick: () => void; theme: CanvasNodeContentProps["ctx"]["theme"] }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                border: `1px solid ${active ? "#6366f1" : theme.node.stroke}`,
                background: active ? "rgba(99,102,241,.18)" : theme.toolbar.panel,
                color: theme.node.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150,
            }}
        >
            {label}
        </button>
    );
}

function ShotCardContent({ ctx }: CanvasNodeContentProps) {
    const f = (ctx.node.metadata?.shotFields || {}) as Partial<Fields>;
    const set = (patch: Partial<Fields>) => ctx.updateMetadata({ shotFields: { ...f, ...patch } });
    const [en, setEn] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const english = en ?? (ctx.node.metadata?.englishPrompt as string | undefined) ?? "";
    const composed = [f.subject, f.scene, f.action].filter((s) => s?.trim()).join("，");

    const transcribe = async () => {
        if (!composed.trim()) return;
        setBusy(true);
        try {
            const chips = [f.lighting, f.camera, f.style].filter(Boolean).join(", ");
            const ratio = f.ratio ? ` Aspect ratio ${f.ratio}.` : "";
            const result = await ctx.generateText(
                `中文镜头描述：${composed}\n英文修饰词：${chips || "（无）"}${ratio}\n请转写为英文生成提示词。`,
                { system: COMPOSE_SYSTEM },
            );
            const text = result.text.trim();
            if (text) {
                setEn(text);
                ctx.updateMetadata({ englishPrompt: text });
            }
        } catch (err) {
            setEn(`⚠ 转写失败:${err instanceof Error ? err.message : String(err)}(可直接复制下方中文描述)`);
        } finally {
            setBusy(false);
        }
    };

    const copyEn = async () => {
        try {
            await navigator.clipboard.writeText(english);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const field = (key: keyof Fields, label: string, placeholder: string) => (
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0, width: 42, textAlign: "right" }}>{label}</span>
            <input
                value={f[key] || ""}
                placeholder={placeholder}
                onChange={(e) => set({ [key]: e.target.value } as Partial<Fields>)}
                onWheel={stop}
                style={{ flex: 1, minWidth: 0, padding: "4px 8px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }}
            />
        </label>
    );

    const chipRow = (key: keyof Fields, label: string, options: string[]) => (
        <div>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 3 }}>{label}<span style={{ fontSize: 10, opacity: 0.6 }}>(点击选/取消)</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {options.map((o) => (
                    <Chip key={o} label={o} theme={ctx.theme} active={f[key] === o} onClick={() => set({ [key]: f[key] === o ? "" : o } as Partial<Fields>)} />
                ))}
            </div>
        </div>
    );

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", overflow: "auto", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            {field("subject", "主体", "一位穿红色连衣裙的少女…")}
            {field("scene", "场景", "雨后的霓虹街头…")}
            {field("action", "动作", "回眸,发丝飘起…")}
            {chipRow("lighting", "光线", LIGHTING)}
            {chipRow("camera", "运镜/景别", CAMERA)}
            {chipRow("style", "风格", STYLE)}
            {chipRow("ratio", "画幅", RATIOS)}

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button type="button" onClick={transcribe} disabled={busy || !composed.trim()} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", cursor: busy ? "wait" : "pointer", fontSize: 12, fontWeight: 600 }}>
                    {busy ? "转写中…" : "✨ 转英文提示词"}
                </button>
                {english && (
                    <button type="button" onClick={copyEn} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 }}>
                        {copied ? "已复制" : "复制"}
                    </button>
                )}
            </div>

            {english && (
                <div style={{ flex: 1, minHeight: 60, overflow: "auto", padding: 8, borderRadius: 8, background: ctx.theme.toolbar.panel, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {english}
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "shot-card",
    name: "镜头提示词卡",
    version: "1.0.0",
    description: "单镜头提示词组装:中文描述+风格芯片,一键 AI 转写为英文生成提示词",
    nodes: [
        {
            type: "shot-card:shot",
            title: "镜头卡",
            icon: "🎥",
            description: "单镜头提示词组装",
            defaultSize: { width: 420, height: 420 },
            defaultMetadata: { shotFields: {}, englishPrompt: "" },
            minimapColor: "#6366f1",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const text = (node.metadata?.englishPrompt as string | undefined) || "";
                return text ? { kind: "text", text } : null;
            },
            Content: ShotCardContent,
        },
    ],
});
