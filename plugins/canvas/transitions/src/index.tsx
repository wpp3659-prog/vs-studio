// 转场词典:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    { name: "硬切", group: "基础", desc: "直接切换,最朴素有力的节奏手段", en: "hard cut transition, direct switch between shots, rhythmic editing" },
    { name: "叠化", group: "基础", desc: "两画面渐变重叠,时间流逝感", en: "cross dissolve transition, overlapping images, passage of time" },
    { name: "白闪", group: "基础", desc: "闪白过渡,冲击/回忆入口", en: "flash to white transition, burst of brightness bridging shots" },
    { name: "黑场", group: "基础", desc: "黑场过渡,章节分隔", en: "fade to black transition, chapter break, moment of silence" },
    { name: "淡入淡出", group: "基础", desc: "缓慢渐入渐出,柔和开场收尾", en: "slow fade in and fade out, gentle opening and closing" },
    { name: "匹配剪辑", group: "高阶", desc: "相似形状/动作跨场景衔接", en: "match cut, similar shapes and movements bridging two scenes" },
    { name: "J-cut", group: "高阶", desc: "下个镜头声音先入", en: "J-cut, audio of next scene enters before the picture" },
    { name: "L-cut", group: "高阶", desc: "上个镜头声音延续", en: "L-cut, audio from previous scene continues over the next shot" },
    { name: "跳切", group: "高阶", desc: "同机位跳跃剪辑,时间压缩", en: "jump cut, same framing with temporal jump, compressed time" },
    { name: "交叉剪辑", group: "高阶", desc: "双线并行交替", en: "cross cutting between parallel storylines, interwoven tension" },
    { name: "甩镜转场", group: "高阶", desc: "高速横甩接下一场景", en: "whip pan transition, fast swish linking two scenes with motion blur" },
    { name: "遮罩转场", group: "创意", desc: "用前景遮挡物扫过切换", en: "wipe transition using foreground object passing across frame" },
    { name: "相似构图", group: "创意", desc: "构图相似的两场景硬接", en: "cut on matching composition, aligned framing across scenes" },
    { name: "运动匹配", group: "创意", desc: "镜头运动方向一致衔接", en: "cut on action, camera movement continues seamlessly into next shot" },
    { name: "光线转场", group: "创意", desc: "镜头扫过光源过曝切换", en: "transition through a light source, lens flare overexposure bridging shots" },
    { name: "无缝转场", group: "创意", desc: "一镜到底式隐形剪辑", en: "seamless invisible transition, one-take illusion, hidden cut" },
    { name: "图形匹配", group: "创意", desc: "图形元素对位切换", en: "graphic match cut, geometric elements aligned across the cut" },
    { name: "闪回", group: "叙事", desc: "进入回忆的转场", en: "flashback transition, dissolve into memory with dreamy color shift" },
    { name: "时间跳跃", group: "叙事", desc: "多年/数日后的省略", en: "time jump transition, temporal ellipsis with changing light and seasons" },
    { name: "节奏剪辑", group: "叙事", desc: "切点跟随音乐节拍", en: "beat-synced editing, cuts landing on musical rhythm, music video energy" },
];

function LibraryContent({ ctx }: CanvasNodeContentProps) {
    const [query, setQuery] = useState("");
    const [group, setGroup] = useState("全部");
    const [copied, setCopied] = useState(false);
    const selected = (ctx.node.metadata?.selected as string | undefined) || "";
    const entry = ENTRIES.find((e) => e.name === selected);
    const groups = ["全部", ...new Set(ENTRIES.map((e) => e.group))];
    const q = query.trim();
    const list = ENTRIES.filter((e) => (group === "全部" || e.group === group) && (!q || e.name.includes(q) || e.desc.includes(q)));

    const pick = (name: string) => ctx.updateMetadata({ selected: name === selected ? "" : name });
    const copy = async () => {
        if (!entry) return;
        try {
            await navigator.clipboard.writeText(entry.en);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const chip = { padding: "3px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <input value={query} placeholder="搜索转场,如「匹配剪辑」「J-cut」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
            <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {groups.map((g) => (
                    <button key={g} type="button" onClick={() => setGroup(g)} style={{ ...chip, background: g === group ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: g === group ? "#6366f1" : ctx.theme.node.stroke }}>
                        {g}
                    </button>
                ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 5, alignContent: "flex-start" }}>
                {list.map((e) => (
                    <button key={e.name} type="button" title={e.desc} onClick={() => pick(e.name)} style={{ ...chip, background: e.name === selected ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: e.name === selected ? "#6366f1" : ctx.theme.node.stroke }}>
                        {e.name}
                    </button>
                ))}
            </div>
            {entry ? (
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 10, background: ctx.theme.toolbar.panel, border: `1px solid ${ctx.theme.node.stroke}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>转场词典 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选转场术语,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "transitions",
    name: "转场词典",
    version: "1.0.0",
    description: "20 种专业转场手法:说明 + 英文转场提示词,写进脚本与剪辑提示",
    nodes: [
        {
            type: "transitions:item",
            title: "转场",
            icon: "🔀",
            description: "20 种专业转场手法:说明 + 英文转场提示词",
            defaultSize: { width: 440, height: 400 },
            defaultMetadata: { selected: "" },
            minimapColor: "#3b82f6",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const e = ENTRIES.find((x) => x.name === (node.metadata?.selected as string | undefined));
                return e ? { kind: "text", text: e.en } : null;
            },
            Content: LibraryContent,
        },
    ],
});
