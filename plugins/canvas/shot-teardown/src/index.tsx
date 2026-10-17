// 拉片复刻：把一条参考视频按时间抽帧，交给视觉模型做逐帧拆解，输出同结构的分镜表与新提示词。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const DIMENSIONS = ["景别", "运镜", "镜头时长", "叙事结构", "节奏", "色彩", "光线", "美术风格", "人物调度", "转场", "声音设计", "情绪曲线"];

const SYSTEM =
    "你是资深拉片师与分镜师。用户会给你同一条参考视频按时间顺序抽取的多张画面帧，以及视频总时长。" +
    "请逐帧分析，输出一张 Markdown 表格，列固定为：帧号 | 时间点 | 景别 | 运镜 | 画面内容 | 色彩光线 | 情绪。" +
    "表格之后另起一节「## 结构拆解」，用要点列出：整体叙事结构、节奏曲线、视觉母题、声音设计推断。" +
    "最后一节「## 复刻分镜表」，按镜头给出：镜头号 | 建议时长 | 景别与运镜 | 可替换的角色/场景/道具 | 英文生成提示词。" +
    "英文提示词要能直接用于文生图或首帧生成，必须包含主体、动作、环境、光线、景别、镜头语言，一行写完。" +
    "只根据看到的画面推断，看不到的不要编，标注为「需确认」。";

// 在浏览器里用 <video> + canvas 抽帧，返回 dataURL 列表。避免上传原视频，省带宽也省权限。
async function extractFrames(url: string, count: number): Promise<{ frames: string[]; duration: number }> {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("视频加载超时")), 20000);
        video.onloadedmetadata = () => {
            window.clearTimeout(timer);
            resolve();
        };
        video.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error("无法加载视频，请确认是浏览器可播放的 mp4/webm"));
        };
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("视频没有可用时长，可能是流媒体地址");
    const canvas = document.createElement("canvas");
    const width = 640;
    canvas.width = width;
    canvas.height = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * width) || 360;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("浏览器无法创建画布");
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
        // 首尾各留半帧余量，避免第一帧和最后一帧是黑场
        const t = duration * ((i + 0.5) / count);
        video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error(`第 ${i + 1} 帧抽帧超时`)), 15000);
            video.onseeked = () => {
                window.clearTimeout(timer);
                resolve();
            };
        });
        ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.82));
    }
    video.src = "";
    return { frames, duration };
}

function ShotTeardownContent({ ctx }: CanvasNodeContentProps) {
    const url = (ctx.node.metadata?.url as string | undefined) || "";
    const brief = (ctx.node.metadata?.brief as string | undefined) || "";
    const frameCount = Number(ctx.node.metadata?.frameCount || 8);
    const output = (ctx.node.metadata?.output as string | undefined) || "";
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    // 上游连了视频节点就直接取它的地址，省得用户再填一遍
    const upstreamVideo = ctx.getUpstream().flatMap((n) => [n.metadata?.content, n.metadata?.url].filter((v): v is string => typeof v === "string" && /^https?:|^data:video|\.mp4|\.webm/i.test(v)))[0] || "";
    const source = url || upstreamVideo;

    const analyze = async () => {
        if (!source || busy) return;
        setBusy(true);
        setError("");
        try {
            setProgress("抽帧中…");
            const { frames, duration } = await extractFrames(source, Math.max(3, Math.min(16, frameCount)));
            setProgress(`已抽 ${frames.length} 帧，分析中…`);
            const r = await ctx.ai.analyzeImages(
                `参考视频总时长约 ${duration.toFixed(1)} 秒，共抽取 ${frames.length} 帧（按时间先后排列）。` +
                    (brief.trim() ? `\n我的复刻目标：${brief.trim()}\n请在复刻分镜表里按这个目标给出替换建议。` : "\n请给出通用复刻建议。"),
                frames,
                { system: SYSTEM },
            );
            if (r.text.trim()) set({ output: r.text.trim() });
            else setError("模型没有返回内容，请检查文本模型是否支持图片输入。");
        } catch (e) {
            setError(`拉片失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setProgress("");
            setBusy(false);
        }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy || !source ? 0.6 : 1 } as const;
    const input = { padding: 7, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box" } as const;

    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <input value={url} onChange={(e) => set({ url: e.target.value })} placeholder="参考视频地址(mp4/webm)；也可直接连一个视频节点到上游" onWheel={stop} style={{ ...input, flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>抽帧数</span>
            {[6, 8, 12, 16].map((n) => <button key={n} onClick={() => set({ frameCount: n })} style={{ ...btn, fontSize: 11, background: frameCount === n ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel }}>{n}</button>)}
            <span style={{ fontSize: 11, opacity: 0.55 }}>{DIMENSIONS.length} 个维度</span>
        </div>
        <div style={{ flexShrink: 0 }}>{ctx.renderPromptInput({ value: brief, onChange: (v) => set({ brief: v }), placeholder: "想复刻什么？例如：换成我的主角，场景改成雨夜街道（可留空，只做结构拆解）", style: { ...input, minHeight: 44, maxHeight: 90, lineHeight: 1.5 } })}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            <button onClick={analyze} disabled={busy || !source} style={primary}>{busy ? progress || "分析中…" : output ? "重新拉片" : "开始拉片"}</button>
            {output ? <button style={btn} onClick={async () => { try { await navigator.clipboard.writeText(output); } catch { /* 忽略 */ } }}>复制</button> : null}
        </div>
        {error ? <div style={{ fontSize: 11, color: "#ef4444", flexShrink: 0 }}>{error}</div> : null}
        <textarea value={output} placeholder="结果包含：逐帧表 / 结构拆解 / 复刻分镜表（带英文提示词）。可直接复制去生图。" onChange={(e) => set({ output: e.target.value })} onWheel={stop} style={{ flex: 1, minHeight: 0, resize: "none", padding: 10, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12.5, lineHeight: 1.6, boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
    </div>;
}

export default definePlugin({
    id: "shot-teardown",
    name: "拉片复刻",
    version: "1.0.0",
    description: "参考视频抽帧逐帧拆解，输出结构分析与同结构复刻分镜表",
    nodes: [{
        type: "shot-teardown:analyze",
        title: "拉片复刻",
        icon: "🔍",
        description: "上传参考视频抽帧，多维度拆解并生成同结构分镜表",
        defaultSize: { width: 490, height: 620 },
        defaultMetadata: { url: "", brief: "", frameCount: 8, output: "" },
        minimapColor: "#ec4899",
        hidePanel: true,
        interactionToggle: true,
        resource: (node) => {
            const text = node.metadata?.output as string | undefined;
            return text ? { kind: "text", text } : null;
        },
        Content: ShotTeardownContent,
    }],
});
