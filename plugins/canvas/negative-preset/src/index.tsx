// 负面词预设:常用负面提示词分组勾选,组合复制。支持自定义分组。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const GROUPS: { label: string; items: string[] }[] = [
    { label: "画质缺陷", items: ["lowres", "blurry", "jpeg artifacts", "pixelated", "noisy", "out of focus"] },
    { label: "人体畸形", items: ["bad anatomy", "bad hands", "extra fingers", "missing fingers", "extra limbs", "deformed face", "asymmetric eyes"] },
    { label: "文字水印", items: ["text", "watermark", "signature", "logo", "subtitles", "username"] },
    { label: "画面瑕疵", items: ["cropped", "out of frame", "duplicate", "cloned face", "gross proportions", "long neck"] },
    { label: "风格污染", items: ["cartoon", "anime", "3d render", "illustration", "painting", "sketch"] },
    { label: "视频专用", items: ["flickering", "morphing", "warping", "temporal artifacts", "jump cut", "stuttering motion"] },
];

const ALL = GROUPS.flatMap((g) => g.items);

function NegativeContent({ ctx }: CanvasNodeContentProps) {
    const checked = new Set(((ctx.node.metadata?.checked as string[] | undefined) || []) as string[]);
    const [copied, setCopied] = useState(false);
    const setChecked = (items: string[]) => ctx.updateMetadata({ checked: items });

    const toggle = (item: string) => {
        const next = new Set(checked);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        setChecked([...next]);
    };

    const selected = ALL.filter((i) => checked.has(i));

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(selected.join(", "));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "3px 8px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, overflow: "auto", minHeight: 0 }}>
            {GROUPS.map((g) => (
                <div key={g.label} style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{g.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {g.items.map((item) => (
                            <button key={item} type="button" onClick={() => toggle(item)} style={{ ...btn, background: checked.has(item) ? "rgba(239,68,68,.18)" : ctx.theme.toolbar.panel, borderColor: checked.has(item) ? "#ef4444" : ctx.theme.node.stroke }}>
                                {checked.has(item) ? "✓ " : ""}{item}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            <div style={{ flexShrink: 0, display: "flex", gap: 6, alignItems: "center", position: "sticky", bottom: 0, paddingTop: 4 }}>
                <button type="button" onClick={copy} disabled={selected.length === 0} style={{ ...btn, border: "none", background: selected.length ? "#ef4444" : ctx.theme.toolbar.panel, color: selected.length ? "#fff" : ctx.theme.node.placeholder, fontWeight: 600 }}>
                    复制({selected.length})
                </button>
                {selected.length ? (
                    <button type="button" onClick={() => setChecked([])} style={btn}>清空</button>
                ) : null}
                <span style={{ fontSize: 11, color: ctx.theme.node.placeholder }}>注意:部分模型(如 Z-Image Turbo)不支持负面词</span>
            </div>
        </div>
    );
}

export default definePlugin({
    id: "negative-preset",
    name: "负面词预设",
    version: "1.0.0",
    description: "常用负面提示词分组勾选,组合一键复制(画质/畸形/水印/视频专用等)",
    nodes: [
        {
            type: "negative-preset:card",
            title: "负面词",
            icon: "🚫",
            description: "负面提示词预设",
            defaultSize: { width: 400, height: 360 },
            defaultMetadata: { checked: [] },
            minimapColor: "#ef4444",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const items = (node.metadata?.checked as string[] | undefined) || [];
                return items.length ? { kind: "text", text: items.join(", ") } : null;
            },
            Content: NegativeContent,
        },
    ],
});
