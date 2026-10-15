// 美术风格库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    {
        "name": "宋式美学",
        "group": "东方美学",
        "desc": "极简留白、汝窑天青、山影屏风",
        "en": "Song dynasty aesthetics, minimal negative space, celadon Ru-ware tones, misty mountain screens, refined scholarly restraint"
    },
    {
        "name": "唐风",
        "group": "东方美学",
        "desc": "金朱浓彩、宝相花、丰腴雍容",
        "en": "Tang dynasty opulence, vermillion and gold, jeweled floral motifs, full rounded figures, cosmopolitan splendor"
    },
    {
        "name": "水墨写意",
        "group": "东方美学",
        "desc": "墨分五色、留白飞白",
        "en": "ink wash painting, five shades of black ink, expressive empty space, flying-white brush texture"
    },
    {
        "name": "赛博朋克",
        "group": "潮流文化",
        "desc": "霓虹雨夜、全息广告、义体改造",
        "en": "cyberpunk, neon-drenched rain streets, holographic billboards, cybernetic implants, high-tech low-life"
    },
    {
        "name": "蒸汽朋克",
        "group": "潮流文化",
        "desc": "黄铜齿轮、蒸汽管道、机械浪漫",
        "en": "steampunk, brass gears and rivets, steam pipes, victorian machinery, warm copper patina"
    },
    {
        "name": "Y2K 复古未来",
        "group": "潮流文化",
        "desc": "金属光泽、气泡界面、千禧乐观",
        "en": "Y2K retro-futurism, chrome blob shapes, bubble UI, iridescent plastics, millennium optimism"
    },
    {
        "name": "蒸波",
        "group": "潮流文化",
        "desc": "霓虹网格、落日线条、VHS 噪点",
        "en": "synthwave, neon grid horizon, linear sunset, VHS scanlines, retro 80s chrome text"
    },
    {
        "name": "波普",
        "group": "潮流文化",
        "desc": "高饱和网点、丝印重复",
        "en": "pop art, saturated ben-day dots, silkscreen repetition, comic boldness"
    },
    {
        "name": "黑色电影",
        "group": "西方流派",
        "desc": "高反差黑白、百叶窗影",
        "en": "film noir, high-contrast monochrome, venetian blind shadows, smoke and fedora silhouettes"
    },
    {
        "name": "Art Deco",
        "group": "西方流派",
        "desc": "几何扇形、金黑对称、爵士时代",
        "en": "Art Deco, geometric sunburst fan motifs, gold and black symmetry, Jazz Age glamour"
    },
    {
        "name": "包豪斯",
        "group": "西方流派",
        "desc": "三原色几何、功能主义",
        "en": "Bauhaus, primary color geometry, functionalist composition, clean grid structures"
    },
    {
        "name": "构成主义",
        "group": "西方流派",
        "desc": "红黑斜切、俄式宣传画",
        "en": "Russian constructivism, red black diagonal cuts, photomontage propaganda energy"
    },
    {
        "name": "巴洛克",
        "group": "西方流派",
        "desc": "戏剧光影、金碧穹顶、动势漩涡",
        "en": "baroque, theatrical chiaroscuro, gilded vaulted ceilings, swirling dynamic drapery"
    },
    {
        "name": "维多利亚",
        "group": "西方流派",
        "desc": "铁艺花窗、绒面暗纹、蒸汽时代",
        "en": "victorian era, wrought iron lacework, dark floral damask, early industrial parlor"
    },
    {
        "name": "中世纪",
        "group": "西方流派",
        "desc": "城堡石墙、羊皮卷纹章",
        "en": "medieval, stone castle halls, illuminated manuscript heraldry, torchlit banquets"
    },
    {
        "name": "古希腊罗马",
        "group": "西方流派",
        "desc": "大理石柱式、白袍垂褶",
        "en": "classical greco-roman, marble columns, draped white chiton, idealized statuary"
    },
    {
        "name": "废土",
        "group": "西方流派",
        "desc": "锈蚀残骸、沙尘辐射",
        "en": "post-apocalyptic wasteland, rusted hulks, sandstorm haze, scavenged patchwork gear"
    },
    {
        "name": "孟菲斯",
        "group": "西方流派",
        "desc": "撞色几何、波浪纹、80s 玩味",
        "en": "Memphis design, clashing pastel geometry, squiggle patterns, playful 80s postmodern"
    },
    {
        "name": "极简北欧",
        "group": "西方流派",
        "desc": "原木浅色、功能留白",
        "en": "scandinavian minimalism, pale woods, soft neutrals, functional negative space"
    },
    {
        "name": "浮世绘",
        "group": "东方美学",
        "desc": "平面套色、波浪云纹",
        "en": "ukiyo-e woodblock, flat color separations, Hokusai waves and stylized clouds, outlined forms"
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
            <input value={query} placeholder="搜索风格,如「宋式」「Y2K」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>美术风格库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选美术风格,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "style-eras",
    name: "美术风格库",
    version: "1.0.0",
    description: "20 种美术方向与年代风格:关键元素 + 英文风格提示词",
    nodes: [
        {
            type: "style-eras:item",
            title: "美术",
            icon: "🏛",
            description: "20 种美术方向与年代风格:关键元素 + 英文风格提示词",
            defaultSize: { width: 440, height: 400 },
            defaultMetadata: { selected: "" },
            minimapColor: "#8b5cf6",
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
