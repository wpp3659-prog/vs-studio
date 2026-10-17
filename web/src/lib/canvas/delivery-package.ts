import i18n from "@/i18n";
import { buildCapCutTimeline, orderTimelineNodes, type CapCutClip, type ExportableNode } from "@/lib/canvas/capcut-draft";
import { CanvasNodeType, type CanvasConnection } from "@/types/canvas";

/**
 * 成片交付包（镜头表 + 素材 + 配音稿 + 字幕）。
 *
 * 定位：客户/甲方要的是「这一条片子有哪些镜头、每镜说了什么、字怎么打」，
 * 而不是一堆散图。这里把画布上的镜头按时间线顺序整理成结构化清单，
 * 同时产出：
 *   - shots.csv / shots.json   镜头表（进 Excel、进审片表）
 *   - voiceover.txt            配音稿（可直接丢给 TTS）
 *   - subtitles.srt            字幕（每镜一句，按镜头时长自动分配）
 *   - README.txt               交付说明与目录索引
 * 素材文件本身由 canvas-export 负责拷进包内，这里只产出文本侧。
 */

export type DeliveryShot = {
    /** 镜头序号，从 1 开始 */
    index: number;
    nodeId: string;
    kind: "image" | "video" | "audio";
    /** 素材在包内的相对路径 */
    fileName: string;
    /** 镜头标题 */
    title: string;
    /** 在成片里的起点（秒） */
    start: number;
    /** 时长（秒） */
    duration: number;
    /** 提示词（画面依据） */
    prompt: string;
    /** 画面里要说的台词/旁白 */
    script: string;
    /** 这段台词对应的文字节点；台词已落到画布文字节点上，就不再标「待配音」 */
    scriptNodeId?: string;
    /** 是否需要在后期补配音（有台词但画布上没有对应音频） */
    needsVoiceover: boolean;
    /** 在成片里的终点（秒） */
    end: number;
};

export type DeliveryPackage = {
    title: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    shots: DeliveryShot[];
    /** 音轨素材（BGM / 配音） */
    audios: CapCutClip[];
    /** 全部台词按镜头顺序拼好的配音稿 */
    voiceover: string;
};

/** 镜头之后挂着的文字节点：既可能是台词，也可能是画面备注。 */
const SCRIPT_TITLE_HINTS = ["台", "旁白", "配音", "台词", "字幕", "voice", "script", "subtitle"];

export function buildDeliveryPackage(nodes: ExportableNode[], connections: CanvasConnection[] = [], options: { title?: string } = {}): DeliveryPackage {
    const timeline = buildCapCutTimeline(nodes, connections, options);
    const playable = nodes.filter(isPlayable);
    const ordered = orderTimelineNodes(playable, connections);
    const clips = timeline.clips.filter((clip) => clip.track === "main");
    const audios = timeline.clips.filter((clip) => clip.track === "audio");
    const scripts = collectShotScripts(nodes, connections);

    const shots: DeliveryShot[] = clips.map((clip, index) => {
        const node = ordered[index];
        const linked = node ? scripts.get(node.id) : undefined;
        const script = linked?.content || "";
        return {
            index: index + 1,
            nodeId: node?.id || "",
            kind: clip.kind,
            fileName: clip.fileName,
            title: clip.name,
            start: round(clip.start),
            duration: round(clip.duration),
            end: round(clip.start + clip.duration),
            prompt: (node?.metadata?.prompt || "").trim(),
            script,
            scriptNodeId: linked?.nodeId,
            needsVoiceover: Boolean(script) && !linked?.hasAudio && audios.length === 0,
        };
    });

    const voiceover = shots
        .filter((shot) => shot.script)
        .map((shot) => `# ${shot.index} ${shot.title}\n${shot.script}`)
        .join("\n\n");

    return {
        title: timeline.title,
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
        duration: round(timeline.duration),
        shots,
        audios,
        voiceover,
    };
}

/**
 * 找出每个镜头节点的台词。
 *
 * 连线分两种方向：文字 → 图片（文生图，文字是提示词）、图片 → 文字（文字是这一镜的台词）。
 * 只看后者；标题里带「台词/旁白/字幕」的优先，其次取第一个。
 * 提示词本身不进台词，否则整条配音稿会变成一长串画面描述。
 */
function collectShotScripts(nodes: ExportableNode[], connections: CanvasConnection[]) {
    const texts = nodes.filter((node) => node.type === CanvasNodeType.Text);
    const audioTargets = new Set(
        connections.filter((edge) => nodes.some((node) => node.id === edge.toNodeId && node.type === CanvasNodeType.Audio)).map((edge) => edge.fromNodeId),
    );
    const playableIds = new Set(nodes.filter(isPlayable).map((node) => node.id));
    const result = new Map<string, { nodeId: string; content: string; hasAudio: boolean }>();

    connections
        .filter((edge) => playableIds.has(edge.fromNodeId))
        .forEach((edge) => {
            const text = texts.find((node) => node.id === edge.toNodeId);
            const content = (text?.metadata?.content || text?.metadata?.prompt || "").trim();
            if (!text || !content) return;
            const existing = result.get(edge.fromNodeId);
            // 一镜多个文字节点时，标题带「台词」的更能代表对白。
            if (existing && !(looksLikeScript(text.title) && !looksLikeScript(texts.find((node) => node.id === existing.nodeId)?.title))) return;
            result.set(edge.fromNodeId, { nodeId: text.id, content, hasAudio: audioTargets.has(text.id) });
        });

    return result;
}

function looksLikeScript(title = "") {
    const lower = title.toLowerCase();
    return SCRIPT_TITLE_HINTS.some((hint) => lower.includes(hint));
}

function isPlayable(node: ExportableNode) {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video) return false;
    if (!node.metadata?.storageKey) return false;
    return node.metadata.status !== "error";
}

/** 镜头表 CSV：固定表头，方便直接粘进表格软件或审片表。 */
export function buildShotsCsv(pkg: DeliveryPackage) {
    const header = i18n.t("canvas.delivery.csvHeader");
    const rows = pkg.shots.map((shot) =>
        [shot.index, shot.title, timecode(shot.start), timecode(shot.end), shot.kind, shot.fileName, shot.script, shot.prompt]
            .map(csvCell)
            .join(","),
    );
    // BOM：Windows Excel 打开 UTF-8 CSV 不加 BOM 会乱码。
    return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

export function buildShotsJson(pkg: DeliveryPackage) {
    return JSON.stringify({ app: "vs-studio", version: 1, exportedAt: new Date().toISOString(), ...pkg }, null, 2);
}

/**
 * 字幕：每镜一句，按镜头时长均分。
 * 没有台词的镜头不出字幕；一句台词一条字幕，按镜头时长均分，句与句首尾相接。
 */
export function buildSrt(pkg: DeliveryPackage) {
    const entries: string[] = [];
    let counter = 1;
    pkg.shots
        .filter((shot) => shot.script)
        .forEach((shot) => {
            const chunks = splitScript(shot.script);
            const unit = shot.duration / chunks.length;
            chunks.forEach((chunk, index) => {
                const start = shot.start + unit * index;
                const end = index === chunks.length - 1 ? shot.start + shot.duration : shot.start + unit * (index + 1);
                entries.push(`${counter}\n${srtTime(start)} --> ${srtTime(end)}\n${chunk}\n`);
                counter += 1;
            });
        });
    return entries.join("\n");
}

/** 配音稿：人念的版本，带镜头序号和时长提示，方便对时长。 */
export function buildVoiceoverScript(pkg: DeliveryPackage) {
    const lines = pkg.shots
        .filter((shot) => shot.script)
        .map((shot) => `[${pad(shot.index)}] (${shot.duration}s) ${shot.script}`);
    return lines.length ? `${lines.join("\n")}\n` : "";
}

export function buildDeliveryReadme(pkg: DeliveryPackage) {
    return i18n.t("canvas.delivery.readme", {
        title: pkg.title,
        count: pkg.shots.length,
        duration: timecode(pkg.duration),
        resolution: `${pkg.width}x${pkg.height}`,
        fps: pkg.fps,
        audioCount: pkg.audios.length,
        voiceCount: pkg.shots.filter((shot) => shot.script).length,
    });
}

/** 需要补配音的台词数：交付时最容易被漏掉的一项，单独统计。 */
export function countMissingVoiceover(pkg: DeliveryPackage) {
    return pkg.shots.filter((shot) => shot.needsVoiceover).length;
}

/**
 * 单句太长（一屏读不完）时按标点断开，保证字幕能读。
 * 每句独立一条字幕：口播节奏按句子走才自然，硬把短句合并回 42 字会让字幕一大坨。
 */
function splitScript(script: string) {
    const chunks = script
        .split(/(?<=[。！？!?；;])/)
        .map((item) => item.trim())
        .filter(Boolean);
    return chunks.length ? chunks : [script];
}

function timecode(seconds: number) {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${pad(minutes)}:${pad(rest)}`;
}

function srtTime(seconds: number) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const secs = Math.floor((ms % 60_000) / 1000);
    const millis = ms % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(millis).padStart(3, "0")}`;
}

function csvCell(value: string | number) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round(value: number) {
    return Math.round(value * 100) / 100;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}
