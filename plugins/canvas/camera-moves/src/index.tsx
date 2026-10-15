// 运镜词典:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    {
        "name": "推镜",
        "group": "基础",
        "desc": "镜头缓慢推向主体,制造紧张或亲密感",
        "en": "slow push-in on the subject, gradual approach, building intimacy and tension"
    },
    {
        "name": "拉镜",
        "group": "基础",
        "desc": "镜头后拉,揭示环境与全局",
        "en": "slow pull-out revealing the wider environment, context reveal shot"
    },
    {
        "name": "摇镜",
        "group": "基础",
        "desc": "机位固定水平旋转扫视",
        "en": "horizontal pan across the scene, steady rotational sweep"
    },
    {
        "name": "俯仰",
        "group": "基础",
        "desc": "机位固定垂直摇移",
        "en": "vertical tilt from low to high, deliberate vertical sweep"
    },
    {
        "name": "横移",
        "group": "基础",
        "desc": "机位平行跟随主体侧向移动",
        "en": "lateral tracking shot, camera trucks alongside the walking subject"
    },
    {
        "name": "跟拍",
        "group": "基础",
        "desc": "跟随主体移动的长镜头",
        "en": "following shot behind the subject, steady forward tracking"
    },
    {
        "name": "升降",
        "group": "基础",
        "desc": "摇臂升降,宏大纵览",
        "en": "crane shot sweeping upward, grand vertical revelation"
    },
    {
        "name": "环绕",
        "group": "进阶",
        "desc": "围绕主体弧线环绕",
        "en": "orbiting arc shot circling around the subject, dynamic revolution"
    },
    {
        "name": "希区柯克变焦",
        "group": "进阶",
        "desc": "主体不动背景畸变,眩晕不安",
        "en": "dolly zoom, vertigo effect, background warps while subject stays fixed, unsettling perspective distortion"
    },
    {
        "name": "甩镜",
        "group": "进阶",
        "desc": "高速横甩产生动态模糊转场",
        "en": "whip pan, fast motion blur swish transition between scenes"
    },
    {
        "name": "手持",
        "group": "进阶",
        "desc": "手持摄影,纪实粗粝呼吸感",
        "en": "handheld camera, raw documentary energy, subtle organic shake"
    },
    {
        "name": "稳定器",
        "group": "进阶",
        "desc": "稳定器丝滑滑行",
        "en": "steadicam glide, fluid seamless floating movement"
    },
    {
        "name": "航拍",
        "group": "进阶",
        "desc": "无人机高空俯瞰",
        "en": "aerial drone shot sweeping over vast landscape, birds-eye vista"
    },
    {
        "name": "变焦",
        "group": "进阶",
        "desc": "光学变焦压缩空间",
        "en": "optical zoom in, spatial compression, flattened telephoto perspective"
    },
    {
        "name": "急推",
        "group": "特殊",
        "desc": "骤然急推,冲击强调",
        "en": "crash zoom, sudden aggressive punch-in for dramatic emphasis"
    },
    {
        "name": "焦点转移",
        "group": "特殊",
        "desc": "前后景焦点互换,引导视线",
        "en": "rack focus shifting between foreground and background planes, guided attention"
    },
    {
        "name": "慢动作",
        "group": "特殊",
        "desc": "升格慢动作,梦幻凝固",
        "en": "slow motion at 120fps, dreamlike suspended movement, flowing fabric and hair"
    },
    {
        "name": "子弹时间",
        "group": "特殊",
        "desc": "时间冻结环绕",
        "en": "bullet time, frozen moment with camera orbiting, suspended debris"
    },
    {
        "name": "第一视角",
        "group": "特殊",
        "desc": "主体主观视角,沉浸代入",
        "en": "POV shot from the subjects perspective, immersive first-person view"
    },
    {
        "name": "荷兰角",
        "group": "特殊",
        "desc": "倾斜地平线,不安失衡",
        "en": "dutch angle, tilted horizon, psychological unease and imbalance"
    }
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
            <input value={query} placeholder="搜索运镜,如「环绕」「希区柯克变焦」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>运镜词典 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选运镜术语,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "camera-moves",
    name: "运镜词典",
    version: "1.0.0",
    description: "20 种专业运镜:说明 + 英文运镜提示词,可直接拼进视频生成提示词",
    nodes: [
        {
            type: "camera-moves:item",
            title: "运镜",
            icon: "🎥",
            description: "20 种专业运镜:说明 + 英文运镜提示词,可直接拼进视频生成提示词",
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
