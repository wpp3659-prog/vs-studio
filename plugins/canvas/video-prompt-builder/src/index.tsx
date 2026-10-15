// 视频提示词构建器:结构化组装视频生成提示词(首帧/主体动作/运镜/镜头/氛围/时长)。
// 运镜芯片与运镜词典同源,组装结果可直接粘贴到 Runway/可灵/即梦等。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Fields = { first: string; action: string; camera: string; lens: string; atmosphere: string; seconds: string };

const CAMERA = ["static locked shot", "slow push in", "slow pull out", "orbit around subject", "tracking shot following subject", "crane up", "handheld follow", "whip pan", "dolly zoom", "aerial drone sweep"];
const LENS = ["14mm ultra wide", "24mm wide", "35mm", "50mm", "85mm portrait", "135mm telephoto", "macro"];
const SECONDS = ["3s", "5s", "8s", "10s"];

function BuilderContent({ ctx }: CanvasNodeContentProps) {
    const f = (ctx.node.metadata?.vf || {}) as Partial<Fields>;
    const set = (patch: Partial<Fields>) => ctx.updateMetadata({ vf: { ...f, ...patch } });
    const [copied, setCopied] = useState(false);

    const parts = [
        f.camera && `Camera: ${f.camera}`,
        f.lens && `Lens: ${f.lens}`,
        f.first && `First frame: ${f.first}`,
        f.action && `Motion: ${f.action}`,
        f.atmosphere && `Atmosphere: ${f.atmosphere}`,
        f.seconds && `Duration: ${f.seconds}`,
    ].filter(Boolean);
    const result = parts.join(" | ");

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(result);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const field = (key: keyof Fields, label: string, placeholder: string) => (
        <label style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0, width: 52, textAlign: "right" }}>{label}</span>
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
        <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 3 }}>{label}<span style={{ fontSize: 10, opacity: 0.6 }}>(点选)</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {options.map((o) => (
                    <button key={o} type="button" onClick={() => set({ [key]: f[key] === o ? "" : o } as Partial<Fields>)} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, cursor: "pointer", border: `1px solid ${f[key] === o ? "#6366f1" : ctx.theme.node.stroke}`, background: f[key] === o ? "rgba(99,102,241,.18)" : ctx.theme.toolbar.panel, color: ctx.theme.node.text }}>
                        {o}
                    </button>
                ))}
            </div>
        </div>
    );

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 7, padding: 12, boxSizing: "border-box", overflow: "auto", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            {field("first", "首帧", "雨后的霓虹街头,少女撑伞回眸…")}
            {field("action", "主体动作", "伞面缓缓抬起,发丝随风…")}
            {chipRow("camera", "运镜", CAMERA)}
            {chipRow("lens", "镜头", LENS)}
            {field("atmosphere", "氛围", "candlelight warmth, shallow depth of field…")}
            {chipRow("seconds", "时长", SECONDS)}
            <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                <button type="button" onClick={copy} disabled={!result} style={{ ...btn, border: "none", background: result ? "#6366f1" : ctx.theme.toolbar.panel, color: result ? "#fff" : ctx.theme.node.placeholder, fontWeight: 600 }}>
                    {copied ? "已复制" : "复制提示词"}
                </button>
                <button type="button" onClick={() => ctx.updateMetadata({ vf: {} })} style={btn}>清空</button>
            </div>
            {result ? (
                <div style={{ flex: 1, minHeight: 60, overflow: "auto", padding: 8, borderRadius: 8, background: ctx.theme.toolbar.panel, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{result}</div>
            ) : null}
        </div>
    );
}

export default definePlugin({
    id: "video-prompt-builder",
    name: "视频提示词构建器",
    version: "1.0.0",
    description: "结构化组装视频生成提示词:首帧/动作/运镜/镜头/氛围/时长,一键复制",
    nodes: [
        {
            type: "video-prompt-builder:card",
            title: "视频提示词",
            icon: "🎞",
            description: "视频提示词结构化组装",
            defaultSize: { width: 440, height: 460 },
            defaultMetadata: { vf: {} },
            minimapColor: "#0ea5e9",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const f = (node.metadata?.vf || {}) as Partial<Fields>;
                const parts = [f.camera && `Camera: ${f.camera}`, f.lens && `Lens: ${f.lens}`, f.first && `First frame: ${f.first}`, f.action && `Motion: ${f.action}`, f.atmosphere && `Atmosphere: ${f.atmosphere}`, f.seconds && `Duration: ${f.seconds}`].filter(Boolean);
                return parts.length ? { kind: "text", text: parts.join(" | ") } : null;
            },
            Content: BuilderContent,
        },
    ],
});
