// 布光方案库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    {
        "name": "伦勃朗光",
        "group": "人像经典",
        "desc": "单侧主光,暗侧脸颊留倒三角光斑",
        "en": "Rembrandt lighting, single key light 45 degrees off-axis, triangle of light on the shadowed cheek, dramatic portrait"
    },
    {
        "name": "蝴蝶光",
        "group": "人像经典",
        "desc": "正面高位光,鼻下蝶形阴影,glamour 首选",
        "en": "butterfly lighting from high front, small symmetrical shadow under the nose, glamorous Paramount beauty light"
    },
    {
        "name": "分割光",
        "group": "人像经典",
        "desc": "面部一半亮一半暗,戏剧张力",
        "en": "split lighting, face divided half-lit half-shadowed along the center line, theatrical tension"
    },
    {
        "name": "环形光",
        "group": "人像经典",
        "desc": "比蝴蝶光稍侧,鼻影偏向一侧",
        "en": "loop lighting, key slightly off-axis, gentle nose shadow curving toward the cheek, flattering commercial portrait"
    },
    {
        "name": "三点布光",
        "group": "电影感",
        "desc": "主光+补光+轮廓光的标准体系",
        "en": "classic three-point lighting, key fill and back light, balanced professional setup"
    },
    {
        "name": "轮廓光",
        "group": "电影感",
        "desc": "发丝边缘高光,主体从背景剥离",
        "en": "strong rim light along hair and shoulders, subject peeled off the dark background, silver edge highlights"
    },
    {
        "name": "低调布光",
        "group": "电影感",
        "desc": "大面积黑,局部照明,悬疑犯罪感",
        "en": "low-key lighting, dominant shadows with selective pools of light, noir suspense mood"
    },
    {
        "name": "高调布光",
        "group": "电影感",
        "desc": "大面积白,阴影极少,清新商业",
        "en": "high-key lighting, bright even illumination, minimal shadows, clean commercial freshness"
    },
    {
        "name": "明暗对照",
        "group": "电影感",
        "desc": "强明暗反差,油画质感",
        "en": "chiaroscuro lighting, extreme light-dark contrast, painterly Caravaggio depth"
    },
    {
        "name": "窗光",
        "group": "氛围",
        "desc": "单侧柔窗光,自然恬静",
        "en": "soft window light from one side, natural falloff, quiet domestic serenity"
    },
    {
        "name": "霓虹双色",
        "group": "氛围",
        "desc": "品红青双色霓虹对打",
        "en": "cross-lit magenta and cyan neon, rain-glossed night, chromatic contrast glow"
    },
    {
        "name": "火光摇曳",
        "group": "氛围",
        "desc": "暖橙摇曳点光,戏剧私语感",
        "en": "flickering firelight, warm orange point source, dancing shadows, intimate tavern mood"
    },
    {
        "name": "月光冷调",
        "group": "氛围",
        "desc": "冷蓝顶逆光+深蓝环境",
        "en": "cold moonlight backlight, steel-blue wash, deep midnight ambience"
    },
    {
        "name": "底光",
        "group": "氛围",
        "desc": "自下而上打光,惊悚脸孔",
        "en": "underlighting from below the face, horror flashlight effect, grotesque inverted shadows"
    },
    {
        "name": "顶光",
        "group": "氛围",
        "desc": "正顶硬光,眼窝深陷,审讯压迫感",
        "en": "hard top light directly overhead, deep eye socket shadows, interrogation pressure"
    },
    {
        "name": "体积光",
        "group": "氛围",
        "desc": "雾中光束,丁达尔效应",
        "en": "volumetric god rays cutting through haze, Tyndall effect, dust motes in light shafts"
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
            <input value={query} placeholder="搜索布光,如「伦勃朗」「蝴蝶光」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>布光方案库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选布光方案,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "lighting-setups",
    name: "布光方案库",
    version: "1.0.0",
    description: "16 种经典布光方案:图解说明 + 英文布光提示词",
    nodes: [
        {
            type: "lighting-setups:item",
            title: "布光",
            icon: "💡",
            description: "16 种经典布光方案:图解说明 + 英文布光提示词",
            defaultSize: { width: 440, height: 400 },
            defaultMetadata: { selected: "" },
            minimapColor: "#f59e0b",
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
