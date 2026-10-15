// 音效氛围库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    { name: "低频轰鸣", group: "氛围", desc: "低音铺底,压迫与不安", en: "deep sub-bass rumble, ominous low frequency drone, building dread" },
    { name: "白噪音", group: "氛围", desc: "中性底噪,都市孤独感", en: "soft white noise bed, neutral ambience, urban solitude" },
    { name: "耳鸣余韵", group: "氛围", desc: "高频耳鸣,失神/冲击后", en: "high-pitched ringing tinnitus, disorienting after-impact sound" },
    { name: "静默留白", group: "氛围", desc: "突然静音,强调冲击", en: "sudden silence, audio dropout for dramatic emphasis" },
    { name: "混响空间", group: "氛围", desc: "大堂/空旷混响,孤独巨大化", en: "long cathedral reverb, vast empty space ambience" },
    { name: "雨声", group: "环境", desc: "雨打玻璃与街道", en: "steady rain on glass and asphalt, cozy melancholic ambience" },
    { name: "城市街道", group: "环境", desc: "车流人声市井底噪", en: "busy city street ambience, distant traffic and voices" },
    { name: "森林清晨", group: "环境", desc: "鸟鸣与微风", en: "forest morning ambience, birdsong and gentle breeze through leaves" },
    { name: "海浪", group: "环境", desc: "潮汐拍岸,辽阔平静", en: "ocean waves rolling onto shore, expansive tranquil atmosphere" },
    { name: "深夜冰箱嗡鸣", group: "环境", desc: "居家深夜极静环境", en: "quiet night room tone, refrigerator hum, intimate domestic stillness" },
    { name: "心跳声", group: "张力", desc: "心跳加速,紧张临界", en: "accelerating heartbeat, rising tension, pulse quickening" },
    { name: "钟摆滴答", group: "张力", desc: "计时压迫感", en: "ominous ticking clock, relentless time pressure" },
    { name: "鼓点推进", group: "张力", desc: "打击乐层层推进", en: "building percussion, layered drums driving toward climax" },
    { name: "弦乐渐强", group: "张力", desc: "弦乐拉满情绪", en: "swelling strings crescendo, emotional intensity rising" },
    { name: "金属摩擦", group: "质感", desc: "机械/工业冷硬声", en: "metal scraping against metal, industrial friction sound" },
    { name: "布料摩擦", group: "质感", desc: "衣物窸窣,贴身真实感", en: "soft fabric rustle, close intimate cloth movement" },
    { name: "脚步回声", group: "质感", desc: "空旷走廊脚步", en: "footsteps echoing in empty corridor, solitary presence" },
    { name: "玻璃碎裂", group: "质感", desc: "脆响瞬间,脆弱崩坏", en: "glass shattering, crisp brittle break, fragile collapse" },
    { name: "复古电流", group: "质感", desc: "老电视/VHS 噪声", en: "vintage analog static, old television hum, retro VHS texture" },
    { name: "水下闷响", group: "质感", desc: "潜入水下的失重听感", en: "underwater muffled ambience, submerged weightless sound" },
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
            <input value={query} placeholder="搜索音效,如「心跳」「雨声」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>音效氛围库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选音效术语,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "sound-design",
    name: "音效氛围库",
    version: "1.0.0",
    description: "20 种专业音效与氛围声:说明 + 英文声音设计提示词",
    nodes: [
        {
            type: "sound-design:item",
            title: "音效",
            icon: "🔊",
            description: "20 种专业音效与氛围声:说明 + 英文声音设计提示词",
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
