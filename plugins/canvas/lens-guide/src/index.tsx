// 镜头焦段指南：全画幅等效焦段、透视特征、景别用途和可复制英文提示词。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
type Lens = { name: string; group: string; desc: string; en: string };
const LENSES: Lens[] = [
    { name: "14mm 超广角", group: "广角", desc: "强烈空间拉伸，近大远小；适合极端主观、狭窄空间与建筑建立镜头。", en: "14mm ultra-wide lens, exaggerated near-far perspective, immersive spatial distortion, keep faces away from frame edges" },
    { name: "18mm 广角", group: "广角", desc: "宽阔环境和强空间感；适合大场景、运动跟拍。", en: "18mm wide-angle lens, expansive environment, dynamic foreground depth, energetic spatial perspective" },
    { name: "24mm 广角", group: "广角", desc: "环境交代清楚，空间感明显；适合全景和室内群戏。", en: "24mm wide lens, environmental wide shot, pronounced depth, characters integrated into the location" },
    { name: "28mm 广角", group: "广角", desc: "贴近人物仍保留环境，纪实和生活流常用。", en: "28mm lens, intimate environmental framing, natural documentary perspective, layered foreground and background" },
    { name: "32mm", group: "标准", desc: "广角感克制，适合双人、中景和手持跟拍。", en: "32mm lens, balanced environmental perspective, natural two-shot, controlled handheld intimacy" },
    { name: "35mm", group: "标准", desc: "人文感和环境信息平衡；适合对话、街景、生活流。", en: "35mm prime lens, humanistic natural perspective, environmental portrait, subtle background separation" },
    { name: "40mm", group: "标准", desc: "接近人眼观感，空间不过分夸张，适合主观自然视角。", en: "40mm lens, natural eye-level perspective, restrained distortion, honest cinematic realism" },
    { name: "50mm", group: "标准", desc: "经典标准视角；适合中景、单人和不强调透视的叙事镜头。", en: "50mm standard prime, neutral perspective, intimate medium shot, clean subject-background balance" },
    { name: "65mm", group: "人像", desc: "轻微压缩，人物特写更柔和，背景开始分离。", en: "65mm portrait lens, gentle perspective compression, flattering close-up, soft background separation" },
    { name: "75mm", group: "人像", desc: "人像与中近景常用，减少面部透视变形。", en: "75mm portrait lens, flattering facial proportions, elegant medium close-up, creamy background bokeh" },
    { name: "85mm", group: "人像", desc: "经典人像焦段；浅景深、背景压缩，适合情绪特写。", en: "85mm portrait prime, shallow depth of field, compressed background, expressive close-up" },
    { name: "100mm 微距", group: "长焦", desc: "微距细节、产品质感和眼部特写；景深极浅。", en: "100mm macro lens, precise product detail, extreme close-up texture, very shallow depth of field" },
    { name: "105mm", group: "长焦", desc: "稳定压缩空间，适合静态人像与细节观察。", en: "105mm telephoto portrait lens, strong subject isolation, compressed space, composed observational framing" },
    { name: "135mm", group: "长焦", desc: "背景压缩明显，适合远距离观察、舞台和情绪隔离。", en: "135mm telephoto lens, pronounced background compression, distant observation, isolated subject" },
    { name: "200mm", group: "长焦", desc: "远距离捕捉与强压缩；适合运动、野外和偷窥式视点。", en: "200mm long telephoto, strong spatial compression, distant candid observation, layered flattened background" },
    { name: "40mm 变形宽银幕", group: "变形宽银幕", desc: "横向宽幅光斑与椭圆焦外；适合电影宽银幕主镜头。", en: "40mm anamorphic lens, widescreen horizontal flares, oval bokeh, cinematic scope composition" },
    { name: "50mm 变形宽银幕", group: "变形宽银幕", desc: "宽银幕人像和双人中景，空间与人物兼顾。", en: "50mm anamorphic lens, cinematic scope two-shot, oval bokeh, subtle horizontal lens flare" },
    { name: "75mm 变形宽银幕", group: "变形宽银幕", desc: "宽银幕近景，压缩适中，焦外更具电影感。", en: "75mm anamorphic portrait lens, cinematic widescreen close-up, compressed depth, oval bokeh" },
];
function LensGuideContent({ ctx }: CanvasNodeContentProps) {
    const [query, setQuery] = useState("");
    const [group, setGroup] = useState("全部");
    const [copied, setCopied] = useState(false);
    const selected = (ctx.node.metadata?.selected as string | undefined) || "";
    const lens = LENSES.find((x) => x.name === selected);
    const groups = ["全部", ...new Set(LENSES.map((x) => x.group))];
    const list = LENSES.filter((x) => (group === "全部" || x.group === group) && (!query.trim() || `${x.name}${x.desc}`.includes(query.trim())));
    const chip = { padding: "3px 8px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <div style={{ fontSize: 10.5, opacity: .7 }}>焦段为全画幅参考值；实际透视也受机位距离、传感器尺寸和光圈影响。</div>
        <input value={query} placeholder="搜索焦段，如 35mm、人像、压缩" onChange={(e) => setQuery(e.target.value)} onWheel={stop} style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{groups.map((g) => <button key={g} onClick={() => setGroup(g)} style={{ ...chip, background: group === g ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{g}</button>)}</div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 5, alignContent: "flex-start" }}>{list.map((x) => <button key={x.name} title={x.desc} onClick={() => ctx.updateMetadata({ selected: x.name === selected ? "" : x.name })} style={{ ...chip, background: x.name === selected ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: x.name === selected ? "#6366f1" : ctx.theme.node.stroke }}>{x.name}</button>)}</div>
        {lens ? <div style={{ flexShrink: 0, padding: 10, borderRadius: 10, background: ctx.theme.toolbar.panel, border: `1px solid ${ctx.theme.node.stroke}` }}><b style={{ fontSize: 12 }}>{lens.name}</b><div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.5 }}>{lens.desc}</div><div style={{ marginTop: 6, font: "11px/1.5 monospace", wordBreak: "break-word" }}>{lens.en}</div><button onClick={async () => { try { await navigator.clipboard.writeText(lens.en); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* 忽略 */ } }} style={{ ...chip, marginTop: 7 }}>{copied ? "已复制" : "复制英文镜头提示"}</button></div> : <div style={{ flexShrink: 0, fontSize: 11, opacity: .65 }}>选择焦段查看透视特征与镜头提示词。</div>}
    </div>;
}
export default definePlugin({ id: "lens-guide", name: "焦段镜头指南", version: "1.0.0", description: "18 组广角/标准/人像/长焦/变形宽银幕焦段参考，解释透视效果与适用景别，附英文镜头提示", nodes: [{ type: "lens-guide:library", title: "焦段指南", icon: "🔭", description: "焦段视觉效果、景别建议与英文镜头提示", defaultSize: { width: 450, height: 430 }, defaultMetadata: { selected: "" }, minimapColor: "#0ea5e9", hidePanel: true, interactionToggle: true, resource: (node) => { const x = LENSES.find((item) => item.name === node.metadata?.selected); return x ? { kind: "text", text: x.en } : null; }, Content: LensGuideContent }] });
