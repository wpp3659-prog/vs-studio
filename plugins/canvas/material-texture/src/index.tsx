// 材质质感库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    {
        "name": "磨砂玻璃",
        "group": "玻璃透明",
        "desc": "半透漫射,朦胧背光",
        "en": "frosted glass, translucent diffusion, soft blurred silhouette behind the pane"
    },
    {
        "name": "清玻璃",
        "group": "玻璃透明",
        "desc": "高透折射、边缘高光",
        "en": "clear glass, crisp refraction, caustic light patterns, beveled edge highlights"
    },
    {
        "name": "裂纹玻璃",
        "group": "玻璃透明",
        "desc": "放射状裂纹、碎而不散",
        "en": "cracked glass, radial fracture lines, shattered but held together"
    },
    {
        "name": "水面",
        "group": "自然",
        "desc": "波光粼粼、倒影扭曲",
        "en": "rippling water surface, specular glints, distorted reflections"
    },
    {
        "name": "冰面",
        "group": "自然",
        "desc": "半透冰层、气泡冻痕",
        "en": "icy surface, translucent depth, trapped air bubbles, frost sheen"
    },
    {
        "name": "熔岩",
        "group": "自然",
        "desc": "龟裂地壳透出炽热",
        "en": "molten lava crust, glowing magma through blackened cracks, heat shimmer"
    },
    {
        "name": "沙丘",
        "group": "自然",
        "desc": "风蚀纹理、细颗粒滑光",
        "en": "sand dunes, wind-etched ripples, fine granular sheen"
    },
    {
        "name": "苔藓",
        "group": "自然",
        "desc": "绒密绿垫、露珠点缀",
        "en": "moss carpet, dense velvet fronds, dew droplets catching light"
    },
    {
        "name": "霜花",
        "group": "自然",
        "desc": "窗面冰晶羽状生长",
        "en": "frost patterns on glass, feathered ice crystals spreading across the pane"
    },
    {
        "name": "拉丝金属",
        "group": "金属",
        "desc": "单向细纹、柔和高光带",
        "en": "brushed metal, fine directional grain, soft elongated highlight band"
    },
    {
        "name": "抛光铬",
        "group": "金属",
        "desc": "镜面反射、环境扭曲",
        "en": "polished chrome, mirror reflections, warped environment on curved surface"
    },
    {
        "name": "做旧铜",
        "group": "金属",
        "desc": "铜绿斑驳、岁月氧层",
        "en": "oxidized copper, verdigris patina patches, weathered age layer"
    },
    {
        "name": "鎏金",
        "group": "金属",
        "desc": "金箔贴面、暗底浮光",
        "en": "gold leaf gilding, foil texture over dark substrate, glinting fragment edges"
    },
    {
        "name": "铸铁",
        "group": "金属",
        "desc": "粗糙砂粒、厚重哑光",
        "en": "cast iron, rough sand grain, heavy matte dark surface"
    },
    {
        "name": "丝绒",
        "group": "织物",
        "desc": "倒向反光、深邃吸光",
        "en": "velvet, directional nap sheen, deep light-absorbing folds"
    },
    {
        "name": "真丝绸",
        "group": "织物",
        "desc": "流光垂褶、柔和波光",
        "en": "silk, liquid drape, soft specular waves along the folds"
    },
    {
        "name": "粗麻",
        "group": "织物",
        "desc": "粗支纱纹、自然毛絮",
        "en": "burlap, coarse weave texture, natural fiber fuzz"
    },
    {
        "name": "牛仔",
        "group": "织物",
        "desc": "斜纹走线、水洗褪色",
        "en": "denim twill, diagonal weave lines, washed fading at stress points"
    },
    {
        "name": "漆皮",
        "group": "织物",
        "desc": "高亮镜面、硬挺反光",
        "en": "patent leather, high-gloss lacquer finish, stiff crisp reflections"
    },
    {
        "name": "羊毛针织",
        "group": "织物",
        "desc": "V 纹绞花、绒感起球",
        "en": "knit wool, cable stitch relief, soft fuzzy fibers"
    },
    {
        "name": "大理石",
        "group": "表面",
        "desc": "天然纹路、镜面抛光",
        "en": "marble, veined stone pattern, polished mirror finish"
    },
    {
        "name": "水磨石",
        "group": "表面",
        "desc": "彩色砾石嵌入",
        "en": "terrazzo, embedded colored stone chips, smooth ground surface"
    },
    {
        "name": "混凝土",
        "group": "表面",
        "desc": "模板印痕、气孔粗糙",
        "en": "raw concrete, formwork imprint lines, pitted air holes, brutalist mass"
    },
    {
        "name": "实木纹理",
        "group": "表面",
        "desc": "年轮山纹、哑光木蜡",
        "en": "wood grain, cathedral ring figure, matte oiled finish"
    },
    {
        "name": "藤编",
        "group": "表面",
        "desc": "人字编织、经纬交错",
        "en": "rattan weave, herringbone over-under pattern, natural fiber intersections"
    },
    {
        "name": "陶瓷釉",
        "group": "表面",
        "desc": "开片釉面、温润反光",
        "en": "glazed ceramic, crackle glaze network, soft warm reflections"
    },
    {
        "name": "皮肤微纹理",
        "group": "人体",
        "desc": "真实毛孔与绒毛",
        "en": "realistic skin micro-texture, visible pores and fine peach fuzz, subsurface scattering"
    },
    {
        "name": "油画笔触",
        "group": "艺术",
        "desc": "厚涂肌理、颜料堆叠",
        "en": "oil impasto, thick palette knife strokes, layered paint ridges"
    },
    {
        "name": "全息镭射",
        "group": "艺术",
        "desc": "彩虹衍射、角度变色",
        "en": "holographic surface, rainbow diffraction shifting with angle"
    },
    {
        "name": "老胶片",
        "group": "艺术",
        "desc": "卤化银颗粒、划痕抖动",
        "en": "aged film grain, silver halide texture, dust scratches and gate weave"
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
            <input value={query} placeholder="搜索材质,如「丝绒」「磨砂」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>材质质感库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选材质,获得英文质感提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "material-texture",
    name: "材质质感库",
    version: "1.0.0",
    description: "30 种材质质感关键词:分类检索 + 英文材质提示词",
    nodes: [
        {
            type: "material-texture:item",
            title: "材质",
            icon: "🧱",
            description: "30 种材质质感关键词:分类检索 + 英文材质提示词",
            defaultSize: { width: 440, height: 400 },
            defaultMetadata: { selected: "" },
            minimapColor: "#14b8a6",
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
