// 表演情绪库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    {
        "name": "狂喜",
        "group": "积极情绪",
        "desc": "眉眼全开、嘴角大幅上扬、身体前倾雀跃",
        "en": "explosive joy, wide sparkling eyes, huge open smile, bouncing on tiptoes, arms thrown up in triumph"
    },
    {
        "name": "温柔",
        "group": "积极情绪",
        "desc": "眼神柔和下视、嘴角浅笑、动作放轻",
        "en": "tender gaze looking softly downward, faint warm smile, gentle careful hand movements"
    },
    {
        "name": "坚定",
        "group": "积极情绪",
        "desc": "下颌微收、目光直视、肩背挺直",
        "en": "determined expression, jaw set, unwavering direct gaze, squared shoulders, fists clenched at sides"
    },
    {
        "name": "好奇",
        "group": "积极情绪",
        "desc": "头部微偏、眉毛上挑、身体前倾",
        "en": "curious tilted head, raised eyebrows, wide attentive eyes, leaning forward"
    },
    {
        "name": "释然",
        "group": "积极情绪",
        "desc": "长出一口气、肩膀垮下、闭眼浅笑",
        "en": "relieved long exhale, shoulders dropping, eyes closing with a faint grateful smile"
    },
    {
        "name": "骄傲",
        "group": "积极情绪",
        "desc": "下巴微抬、双臂交叉、目光俯视",
        "en": "proud chin lifted, arms crossed, commanding downward gaze, slight smirk"
    },
    {
        "name": "孤独",
        "group": "消极情绪",
        "desc": "背影蜷缩、目光空洞、远离人群",
        "en": "lonely hunched silhouette, vacant distant stare, isolated at the edge of frame"
    },
    {
        "name": "隐忍",
        "group": "消极情绪",
        "desc": "咬紧牙关、泛红眼眶、手握拳颤抖",
        "en": "suppressed grief, jaw clenched tight, reddened welling eyes, trembling fists held rigid"
    },
    {
        "name": "崩溃",
        "group": "消极情绪",
        "desc": "掩面、呼吸急促、身体失力下滑",
        "en": "emotional breakdown, hands covering face, ragged breathing, body sliding down the wall"
    },
    {
        "name": "恐惧",
        "group": "消极情绪",
        "desc": "瞳孔放大、后缩、手护颈",
        "en": "fear, dilated pupils, shrinking backward, protective hand at the throat, shallow rapid breathing"
    },
    {
        "name": "愤怒",
        "group": "消极情绪",
        "desc": "眉峰紧锁、鼻翼扩张、指指戳戳",
        "en": "raging fury, brows knotted, flared nostrils, stabbing finger gestures, veins visible"
    },
    {
        "name": "轻蔑",
        "group": "消极情绪",
        "desc": "单侧嘴角上挑、斜视、缓缓摇头",
        "en": "contemptuous smirk on one side, sidelong glance, slow dismissive head shake"
    },
    {
        "name": "焦虑",
        "group": "消极情绪",
        "desc": "搓手、咬指甲、视线游移",
        "en": "anxious fidgeting hands, nail biting, darting restless eyes, bouncing knee"
    },
    {
        "name": "麻木",
        "group": "消极情绪",
        "desc": "面无表情、动作迟缓、失焦目光",
        "en": "numbed blank expression, mechanical slow movements, unfocused thousand-yard stare"
    },
    {
        "name": "羞愧",
        "group": "消极情绪",
        "desc": "低头避视、捂脸、耳根发红",
        "en": "shameful head bowed, avoiding all eye contact, hand over face, flushed ears"
    },
    {
        "name": "疑虑",
        "group": "复杂状态",
        "desc": "眯眼审视、抱臂后退、欲言又止",
        "en": "suspicious narrowed eyes, arms crossed stepping back, parted lips hesitating to speak"
    },
    {
        "name": "怅然若失",
        "group": "复杂状态",
        "desc": "望向远方、指尖轻触旧物",
        "en": "wistful gaze into the distance, fingertips brushing an old photograph, faint bittersweet smile"
    },
    {
        "name": "暗自窃喜",
        "group": "复杂状态",
        "desc": "抿嘴偷笑、眼神闪躲、搓手",
        "en": "smug secret delight, pressed lips hiding a grin, shifty gleaming eyes, rubbing palms together"
    },
    {
        "name": "强颜欢笑",
        "group": "复杂状态",
        "desc": "嘴角上扬眼神悲伤",
        "en": "forced smile, upturned mouth but sorrowful glassy eyes, barely holding composure"
    },
    {
        "name": "警觉",
        "group": "复杂状态",
        "desc": "侧耳回头、瞳孔收缩、肌肉紧绷",
        "en": "alert vigilance, head snapping toward sound, constricted pupils, coiled tense muscles"
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
            <input value={query} placeholder="搜索情绪,如「隐忍」「狂喜」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>表演情绪库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选情绪,获得人物表演提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "emotion-guide",
    name: "表演情绪库",
    version: "1.0.0",
    description: "20 种人物表演情绪:表演要点 + 英文表情肢体提示词",
    nodes: [
        {
            type: "emotion-guide:item",
            title: "情绪",
            icon: "🎭",
            description: "20 种人物表演情绪:表演要点 + 英文表情肢体提示词",
            defaultSize: { width: 440, height: 400 },
            defaultMetadata: { selected: "" },
            minimapColor: "#ec4899",
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
