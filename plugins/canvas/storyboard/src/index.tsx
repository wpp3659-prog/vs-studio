// 分镜表节点:镜头号/景别/画面/台词/时长/提示词,一行一个镜头。
// 「复制提示词」把全部镜头提示词按顺序拼好,直接粘去生图/生视频工具。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Shot = { id: number; shot: string; size: string; action: string; line: string; dur: string; prompt: string };

const EMPTY: Shot = { id: 0, shot: "", size: "", action: "", line: "", dur: "", prompt: "" };
const HEADERS: { key: keyof Omit<Shot, "id">; label: string; w: number }[] = [
    { key: "shot", label: "镜头", w: 44 },
    { key: "size", label: "景别", w: 60 },
    { key: "action", label: "画面描述", w: 160 },
    { key: "line", label: "台词/旁白", w: 130 },
    { key: "dur", label: "时长", w: 48 },
    { key: "prompt", label: "生成提示词", w: 180 },
];

function normalize(raw: unknown): Shot[] {
    if (!Array.isArray(raw)) return [{ ...EMPTY, id: 1, shot: "1" }];
    return raw.map((it, i) => ({
        id: Number((it as Shot).id) || i + 1,
        shot: String((it as Shot).shot ?? String(i + 1)),
        size: String((it as Shot).size ?? ""),
        action: String((it as Shot).action ?? ""),
        line: String((it as Shot).line ?? ""),
        dur: String((it as Shot).dur ?? ""),
        prompt: String((it as Shot).prompt ?? ""),
    }));
}

function buildPromptText(shots: Shot[]): string {
    return shots
        .filter((s) => s.prompt.trim())
        .map((s) => `【镜头${s.shot || "?"}】${s.prompt.trim()}`)
        .join("\n\n");
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function StoryboardContent({ ctx }: CanvasNodeContentProps) {
    const [copied, setCopied] = useState("");
    const shots = normalize(ctx.node.metadata?.shots);
    const setShots = (next: Shot[]) => ctx.updateMetadata({ shots: next });
    const patch = (id: number, key: keyof Omit<Shot, "id">, value: string) =>
        setShots(shots.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

    const flash = (tag: string) => {
        setCopied(tag);
        window.setTimeout(() => setCopied(""), 1200);
    };

    const input = {
        width: "100%", border: "none", outline: "none", background: "transparent",
        color: ctx.theme.node.text, fontSize: 12, padding: "5px 6px", boxSizing: "border-box",
        fontFamily: "inherit",
    } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", overflow: "auto", boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, position: "relative" }}>
            {copied && (
                <div style={{ position: "sticky", top: 0, zIndex: 5, textAlign: "center", padding: "4px 0", fontSize: 12, background: "#10b981", color: "#fff" }}>{copied}</div>
            )}
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                    <tr>
                        {HEADERS.map((h) => (
                            <th key={h.key} style={{ border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, padding: "5px 6px", fontSize: 12, fontWeight: 600, textAlign: "left", minWidth: h.w, position: "sticky", top: copied ? 24 : 0 }}>{h.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {shots.map((s) => (
                        <tr key={s.id}>
                            {HEADERS.map((h) => (
                                <td key={h.key} style={{ border: `1px solid ${ctx.theme.node.stroke}`, padding: 0, verticalAlign: "top" }}>
                                    {h.key === "prompt" ? (
                                        <div style={{ position: "relative" }}>
                                            <textarea
                                                value={s.prompt}
                                                onChange={(e) => patch(s.id, h.key, e.target.value)}
                                                onWheel={stop}
                                                rows={2}
                                                style={{ ...input, resize: "vertical", minHeight: 42, lineHeight: 1.4 }}
                                            />
                                            {s.prompt.trim() && (
                                                <button
                                                    type="button"
                                                    title="复制本镜头提示词"
                                                    onClick={async () => flash((await copyText(s.prompt.trim())) ? "已复制本镜头提示词" : "复制失败")}
                                                    style={{ position: "absolute", top: 3, right: 3, padding: "1px 6px", fontSize: 10, borderRadius: 6, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer" }}
                                                >
                                                    复制
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <input value={s[h.key]} onChange={(e) => patch(s.id, h.key, e.target.value)} onWheel={stop} placeholder={h.key === "size" ? "远景/全景/特写…" : h.key === "dur" ? "3s" : ""} style={input} />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default definePlugin({
    id: "storyboard",
    name: "分镜表节点",
    version: "1.0.0",
    description: "影视/TVC 分镜表:镜头号·景别·画面·台词·时长·提示词,一键复制全部提示词",
    nodes: [
        {
            type: "storyboard:board",
            title: "分镜表",
            icon: "🎬",
            description: "分镜脚本表格",
            defaultSize: { width: 680, height: 320 },
            defaultMetadata: { shots: [{ ...EMPTY, id: 1, shot: "1" }] },
            minimapColor: "#e11d48",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => ({ kind: "text", text: buildPromptText(normalize(node.metadata?.shots)) }),
            Content: StoryboardContent,
            toolbar: (ctx) => {
                const shots = normalize(ctx.node.metadata?.shots);
                return [
                    {
                        id: "sb-add",
                        title: "在末尾新增一个镜头",
                        label: "加镜头",
                        icon: "➕",
                        onClick: () => ctx.updateMetadata({ shots: [...shots, { ...EMPTY, id: Date.now(), shot: String(shots.length + 1) }] }),
                    },
                    {
                        id: "sb-del",
                        title: "删除最后一个镜头",
                        label: "删镜头",
                        icon: "➖",
                        onClick: () => shots.length > 1 && ctx.updateMetadata({ shots: shots.slice(0, -1) }),
                    },
                    {
                        id: "sb-copy-prompts",
                        title: "复制全部镜头的生成提示词(带镜头号)",
                        label: "复制提示词",
                        icon: "📋",
                        onClick: () => navigator.clipboard.writeText(buildPromptText(shots)),
                    },
                    {
                        id: "sb-copy-tsv",
                        title: "复制整张分镜表(可粘进 Excel)",
                        label: "复制整表",
                        icon: "🖨",
                        onClick: () =>
                            navigator.clipboard.writeText(
                                [HEADERS.map((h) => h.label).join("\t"), ...shots.map((s) => HEADERS.map((h) => s[h.key]).join("\t"))].join("\n"),
                            ),
                    },
                ];
            },
        },
    ],
});
