// 服化道词库:专业词库,搜索/分组 + 点选 + 一键复制英文提示词,可连下游。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Entry = { name: string; group: string; desc: string; en: string };

const ENTRIES: Entry[] = [
    { name: "白衬衫职场", group: "服装", desc: "干练都市白领质感", en: "crisp white shirt, tailored office wear, polished professional look" },
    { name: "Oversize 西装", group: "服装", desc: "松弛感时尚廓形", en: "oversized tailored blazer, relaxed silhouette, effortless fashion editorial" },
    { name: "复古旗袍", group: "服装", desc: "东方古典韵味", en: "vintage qipao cheongsam, elegant oriental silhouette, silk with floral pattern" },
    { name: "古风汉服", group: "服装", desc: "飘逸国风长袍", en: "flowing hanfu robes, layered traditional Chinese garments, ethereal drapery" },
    { name: "法式碎花", group: "服装", desc: "浪漫田园少女感", en: "french floral midi dress, romantic countryside charm, soft pastel print" },
    { name: "皮衣机车", group: "服装", desc: "酷感皮革与金属", en: "black leather biker jacket, silver hardware, rebellious attitude" },
    { name: "机能风", group: "服装", desc: "未来机能/城市忍者", en: "techwear outfit, utility straps and buckles, urban ninja aesthetic" },
    { name: "针织居家", group: "服装", desc: "温暖柔软治愈感", en: "cozy oversized knit sweater, warm domestic comfort, soft wool texture" },
    { name: "校服", group: "服装", desc: "青春校园记忆", en: "school uniform, pleated skirt, youthful nostalgia" },
    { name: "做旧磨损", group: "服装", desc: "岁月痕迹的粗糙质感", en: "distressed weathered fabric, frayed edges, worn-in texture" },
    { name: "玻璃肌", group: "妆容", desc: "通透水光皮肤", en: "glass skin makeup, luminous dewy complexion, translucent glow" },
    { name: "湿发背头", group: "妆容", desc: "凌厉高级感", en: "slicked-back wet hair, sharp editorial styling, high fashion severity" },
    { name: "烟熏妆", group: "妆容", desc: "浓烈夜色眼神", en: "smokey eye makeup, intense dark gaze, nocturnal glamour" },
    { name: "素颜感", group: "妆容", desc: "裸妆真实自然", en: "no-makeup makeup look, natural bare skin, authentic simplicity" },
    { name: "老式电视机", group: "道具", desc: "CRT 复古氛围源", en: "vintage CRT television, glowing static screen, retro centerpiece prop" },
    { name: "胶片相机", group: "道具", desc: "创作者身份符号", en: "vintage film camera, leather strap, nostalgic creator prop" },
    { name: "霓虹招牌", group: "道具", desc: "都市夜色光源", en: "flickering neon sign, glowing Chinese characters, rainy night backdrop" },
    { name: "咖啡杯", group: "道具", desc: "生活流治愈符号", en: "ceramic coffee cup with latte art, steam rising, cozy lifestyle prop" },
    { name: "花束", group: "道具", desc: "情绪与仪式感载体", en: "fresh flower bouquet, soft petals, romantic ceremonial prop" },
    { name: "旧信件纸页", group: "道具", desc: "记忆与叙事媒介", en: "aged handwritten letters, yellowed paper, nostalgic narrative prop" },
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
            <input value={query} placeholder="搜索服化道,如「旗袍」「霓虹招牌」" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }} />
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
                    <div style={{ fontSize: 12, fontWeight: 600 }}>服化道词库 · {entry.name}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>{entry.desc}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto", opacity: 0.95 }}>{entry.en}</div>
                    <button type="button" onClick={copy} style={{ ...chip, alignSelf: "flex-start", padding: "4px 10px" }}>{copied ? "已复制" : "复制英文提示词"}</button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选服化道词条,获得英文提示词</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "wardrobe-props",
    name: "服化道词库",
    version: "1.0.0",
    description: "20 条服装/妆容/道具词条:说明 + 英文造型提示词,统一人物与场景质感",
    nodes: [
        {
            type: "wardrobe-props:item",
            title: "服化道",
            icon: "👔",
            description: "20 条服装/妆容/道具词条:说明 + 英文造型提示词",
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
