// 导演风格库:24 位导演的视觉风格档案,点选即得英文风格提示词。
// 数据内置,不依赖网络;英文片段可直接拼接进生图/生视频提示词。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Director = { name: string; en: string; desc: string };

const DIRECTORS: Director[] = [
    { name: "克里斯托弗·诺兰", desc: "非线性时间、IMAX 实拍质感、宏大冷峻", en: "Christopher Nolan style, nonlinear time structure, IMAX large-format cinematography, practical effects, cold desaturated palette, cerebral epic tone, cross-cut timelines" },
    { name: "丹尼斯·维伦纽瓦", desc: "极简巨物感、缓慢推镜、雾气与负空间", en: "Denis Villeneuve style, monumental minimalism, vast negative space, slow push-in shots, atmospheric haze, muted earth tones, overwhelming scale, contemplative pacing" },
    { name: "韦斯·安德森", desc: "对称构图、马卡龙色、怪趣精致", en: "Wes Anderson style, perfectly symmetrical framing, pastel color palette, planimetric composition, centered subjects, whimsical retro props, deadpan charm" },
    { name: "昆汀·塔伦蒂诺", desc: "长对白、高饱和复古、暴力美学", en: "Quentin Tarantino style, trunk shot, long dialogue tension, saturated retro colors, 70mm film grain, genre mashup energy, bold graphic composition" },
    { name: "王家卫", desc: "霓虹夜色、抽帧拖影、克制暧昧", en: "Wong Kar-wai style, neon-lit night streets, step-printing motion blur, saturated reds and greens, reflections and rain, melancholic intimacy, handheld closeness" },
    { name: "斯坦利·库布里克", desc: "一点透视、冷峻对称、科技寒光", en: "Stanley Kubrick style, one-point perspective, glacial symmetry, cold clinical lighting, wide-angle geometry, unsettling stillness, era-precise production design" },
    { name: "大卫·芬奇", desc: "青绿低饱和、精准运镜、阴影叙事", en: "David Fincher style, desaturated teal-green grade, precise dolly moves, chiaroscuro shadows, obsessive detail, grim institutional spaces, controlled dread" },
    { name: "雷德利·斯科特", desc: "体积光雾、史诗场景、异星氛围", en: "Ridley Scott style, volumetric light through haze, epic production design, smoky interiors, alien atmosphere, god-ray backlight, painterly widescreen" },
    { name: "史蒂文·斯皮尔伯格", desc: "暖逆光、仰角奇迹感、柔光光斑", en: "Steven Spielberg style, warm backlight, low-angle childlike wonder, soft lens flares, golden hour warmth, awe reveal shots, family-safe adventure tone" },
    { name: "詹姆斯·卡梅隆", desc: "巨制规模、蓝青光泽、尖端视效", en: "James Cameron style, epic blockbuster scale, glossy blue-teal palette, cutting-edge VFX realism, dynamic action staging, bioluminescent accents" },
    { name: "科恩兄弟", desc: "冷幽默美国志、静态广角、怪人怪事", en: "Coen Brothers style, offbeat Americana, static wide compositions, quirky character staging, muted earthy palette, ironic narration tone" },
    { name: "蒂姆·波顿", desc: "哥特怪趣、条纹螺旋、月光冷调", en: "Tim Burton style, gothic whimsy, striped and spiral motifs, moonlit blue palette, exaggerated crooked architecture, expressionist shadows" },
    { name: "宫崎骏", desc: "手绘天空、飞行憧憬、自然灵性", en: "Hayao Miyazaki style, lush hand-painted cumulus skies, whimsical flight, verdant nature detail, warm nostalgic palette, gentle fantastical creatures" },
    { name: "新海诚", desc: "超精细天空、逆光光斑、黄昏雨景", en: "Makoto Shinkai style, hyper-detailed skies, dramatic cloudscapes, lens flare backlight, rain-soaked streets, saturated dusk colors, youth romance mood" },
    { name: "张艺谋", desc: "大色块铺陈、红与金、仪式感构图", en: "Zhang Yimou style, saturated monochrome color fields, vivid reds and golds, ritualistic choreography, vast human arrays, folk texture, operatic drama" },
    { name: "李安", desc: "克制情感、水的意象、细腻光线", en: "Ang Lee style, restrained emotional storytelling, water imagery, delicate natural light, silky camera flow, cross-cultural tenderness" },
    { name: "奉俊昊", desc: "类型混搭、建筑喻阶级、雨夜冷调", en: "Bong Joon-ho style, genre-blending tension, architecture as social metaphor, rain-soaked cool palette, precise blocking, dark humor undertone" },
    { name: "黑泽明", desc: "长焦压缩、风雨意志、恣意涂抹", en: "Akira Kurosawa style, telephoto compression, wind and rain as drama, high-contrast ink-like imagery, dynamic diagonal blocking, samurai gravitas" },
    { name: "吉尔莫·德尔·托罗", desc: "怪物哥特、琥珀青、烛光童话", en: "Guillermo del Toro style, creature-feature gothic, amber and teal palette, candlelit interiors, ornate gothic detail, dark fairy tale romance" },
    { name: "索菲亚·科波拉", desc: "粉彩惘然、柔焦疏离、青春寂寞", en: "Sofia Coppola style, pastel palette, soft diffused focus, listless luxury interiors, celebrity loneliness, dreamy pop soundtrack mood" },
    { name: "保罗·托马斯·安德森", desc: "年代质感、长镜头、群像浮世", en: "Paul Thomas Anderson style, period-authentic detail, sweeping long takes, ensemble staging, warm naturalistic grade, restless Americana" },
    { name: "泰伦斯·马力克", desc: "旁白诗、魔幻时刻、自然光漫游", en: "Terrence Malick style, poetic voiceover tone, magic-hour natural light, floating steadicam through fields, whispered intimacy, cosmic juxtaposition" },
    { name: "大卫·林奇", desc: "超现实不安、红帷幕、工业低鸣", en: "David Lynch style, surreal uncanny dread, red curtain motifs, industrial hum, off-kilter sound design, dreamlike discontinuity" },
    { name: "扎克·施奈德", desc: "变速镜头、去饱和史诗、神光构图", en: "Zack Snyder style, speed-ramped action, desaturated gritty grade, godlight beams, heroic low-angle freeze frames, operatic slow motion" },
    { name: "徐克", desc: "武侠动感、威亚飞旋、雾林山水", en: "Tsui Hark style, kinetic wire-fu action, misty bamboo forests, dynamic tilted angles, ink-wash landscape palette, sword-energy spectacle" },
    { name: "侯孝贤", desc: "固定长镜、生活流、框中框", en: "Hou Hsiao-hsien style, static long takes, layered foreground framing, natural ambient light, quiet observational pacing, everyday lyricism" },
];

function DirectorStylesContent({ ctx }: CanvasNodeContentProps) {
    const [query, setQuery] = useState("");
    const [copied, setCopied] = useState(false);
    const selected = (ctx.node.metadata?.director as string | undefined) || "";
    const director = DIRECTORS.find((d) => d.name === selected);
    const list = DIRECTORS.filter((d) => !query.trim() || d.name.includes(query.trim()) || d.desc.includes(query.trim()));

    const pick = (name: string) => ctx.updateMetadata({ director: name === selected ? "" : name });

    const copy = async () => {
        if (!director) return;
        try {
            await navigator.clipboard.writeText(director.en);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch { /* 忽略 */ }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <input
                value={query}
                placeholder="搜索导演,如「王家卫」「诺兰」"
                onChange={(e) => setQuery(e.target.value)}
                onWheel={stop}
                style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }}
            />
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 5, alignContent: "flex-start" }}>
                {list.map((d) => (
                    <button
                        key={d.name}
                        type="button"
                        title={d.desc}
                        onClick={() => pick(d.name)}
                        style={{ ...btn, fontSize: 11, padding: "3px 9px", background: d.name === selected ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: d.name === selected ? "#6366f1" : ctx.theme.node.stroke }}
                    >
                        {d.name}
                    </button>
                ))}
            </div>
            {director ? (
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 10, background: ctx.theme.toolbar.panel, border: `1px solid ${ctx.theme.node.stroke}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{director.name}<span style={{ fontWeight: 400, opacity: 0.7 }}> · {director.desc}</span></div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.55, opacity: 0.9, fontFamily: "Consolas, Menlo, monospace", wordBreak: "break-word", maxHeight: 84, overflow: "auto" }}>{director.en}</div>
                    <button type="button" onClick={copy} style={{ ...btn, alignSelf: "flex-start" }}>
                        {copied ? "已复制" : "复制英文风格提示词"}
                    </button>
                </div>
            ) : (
                <div style={{ flexShrink: 0, fontSize: 11, color: ctx.theme.node.placeholder }}>点选导演,获得可直接拼进提示词的英文风格描述</div>
            )}
        </div>
    );
}

export default definePlugin({
    id: "director-styles",
    name: "导演风格库",
    version: "1.0.0",
    description: "24 位导演视觉风格档案:点选即得英文风格提示词,可拼进生图/生视频提示词",
    nodes: [
        {
            type: "director-styles:library",
            title: "导演风格",
            icon: "🎬",
            description: "导演风格提示词库",
            defaultSize: { width: 420, height: 380 },
            defaultMetadata: { director: "" },
            minimapColor: "#a855f7",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const name = node.metadata?.director as string | undefined;
                const d = DIRECTORS.find((x) => x.name === name);
                return d ? { kind: "text", text: d.en } : null;
            },
            Content: DirectorStylesContent,
        },
    ],
});
