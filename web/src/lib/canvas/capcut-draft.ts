import i18n from "@/i18n";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

/**
 * 剪映（CapCut / 剪映专业版）草稿导出。
 *
 * 做的是「最小可打开」的草稿包，而不是完整复刻剪映工程：
 * 剪映的 draft_content.json 是内部格式，字段随版本变动，写多了反而容易让某个版本打不开。
 * 这里只写剪映各版本都认的核心字段（画布尺寸、帧率、轨道、素材、片段区间），
 * 复杂效果（转场、调色、字幕样式）留在剪映里做——我们的定位是「生成」，不是「非编」。
 *
 * 输出结构（剪映 5.x ~ 6.x 的草稿目录形态）：
 *   <项目名>/
 *     draft_content.json      时间线内容
 *     draft_meta_info.json    素材清单与草稿信息
 *     materials/video.mp4     实际媒体文件
 *   <项目名>.zip              整个目录打包，解压到剪映草稿目录即可见
 */

/** 剪映草稿的时间基（微秒），所有 start / duration 都用整数微秒，避免浮点误差导致片段重叠。 */
const TIME_BASE = 1_000_000;
const DEFAULT_FPS = 30;
const DEFAULT_IMAGE_SECONDS = 3;
const DEFAULT_VIDEO_SECONDS = 5;

export type CapCutClip = {
    name: string;
    /** 打包进草稿包里的相对路径，例如 materials/01-镜头1.mp4 */
    fileName: string;
    kind: "image" | "video" | "audio";
    /** 在时间线上的起点（秒） */
    start: number;
    /** 时长（秒） */
    duration: number;
    /** 视频/音频原始时长，用于判断是否需要变速；未知时按 duration 处理 */
    sourceDuration?: number;
    /** 音频是否需要抬高到主轨（BGM 放音频轨、配音放主轨之外的音轨） */
    track: "main" | "audio";
};

export type CapCutTimeline = {
    title: string;
    width: number;
    height: number;
    fps: number;
    clips: CapCutClip[];
    /** 总时长（秒），由片段算出 */
    duration: number;
};

type ExportableNode = Pick<CanvasNodeData, "id" | "type" | "title" | "position" | "width" | "height" | "metadata">;

/**
 * 把画布节点整理成一条时间线。
 *
 * 排序规则（按优先级）：
 * 1. 有连线时按连线拓扑顺序（上游在前），同一层再按从左到右、从上到下；
 * 2. 没连线时按画布阅读顺序（先上后下、先左后右）。
 *
 * 只有「有实际内容」的图片/视频节点会进主轨；音频节点单独放音轨，从 0 秒开始铺。
 */
export function buildCapCutTimeline(nodes: ExportableNode[], connections: CanvasConnection[] = [], options: { title?: string } = {}): CapCutTimeline {
    const playable = nodes.filter(isPlayableNode);
    const ordered = orderTimelineNodes(playable, connections);
    const clips: CapCutClip[] = [];
    const audioClips: CapCutClip[] = [];
    let cursor = 0;
    ordered.forEach((node, index) => {
        const kind = node.type === CanvasNodeType.Video ? "video" : "image";
        const sourceDuration = Number(node.metadata?.durationMs) / 1000;
        const duration = kind === "video" ? Math.max(0.5, finiteOr(sourceDuration, DEFAULT_VIDEO_SECONDS)) : DEFAULT_IMAGE_SECONDS;
        const name = clipName(node, index);
        clips.push({
            name,
            fileName: `materials/${pad(index + 1)}-${safeName(name)}.${kind === "video" ? "mp4" : "png"}`,
            kind,
            start: cursor,
            duration,
            sourceDuration: kind === "video" ? duration : undefined,
            track: "main",
        });
        cursor += duration;
    });

    let audioCursor = 0;
    nodes
        .filter((node) => node.type === CanvasNodeType.Audio && node.metadata?.storageKey)
        .forEach((node, index) => {
            const duration = Math.max(0.5, finiteOr(Number(node.metadata?.durationMs) / 1000, DEFAULT_VIDEO_SECONDS));
            const name = node.title || i18n.t("canvas.capcut.audioName", { index: index + 1 });
            audioClips.push({
                name,
                fileName: `materials/${pad(ordered.length + index + 1)}-${safeName(name)}.mp3`,
                kind: "audio",
                start: audioCursor,
                duration,
                track: "audio",
            });
            audioCursor += duration;
        });

    const all = [...clips, ...audioClips];
    return {
        title: options.title || i18n.t("canvas.capcut.defaultTitle"),
        ...resolveCanvasSize(nodes),
        fps: DEFAULT_FPS,
        clips: all,
        duration: Math.max(cursor, audioCursor, 0.1),
    };
}

/** 画布尺寸取所有主轨素材里最常见的宽高比，并吸附到 1080 短边。 */export function resolveCanvasSize(nodes: ExportableNode[]) {
    const ratios = nodes
        .filter((node) => node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video)
        .map((node) => {
            const width = Number(node.metadata?.naturalWidth) || node.width;
            const height = Number(node.metadata?.naturalHeight) || node.height;
            return width > 0 && height > 0 ? width / height : 0;
        })
        .filter((ratio) => ratio > 0);
    const ratio = ratios.length ? majority(ratios.map((item) => Math.round(item * 100) / 100)) : 16 / 9;
    // 统一短边 1080，长边补成偶数：剪映对奇数分辨率会自己纠正，提前对齐省得片段变形。
    if (ratio >= 1) return { width: even(Math.round(1080 * ratio)), height: 1080 };
    return { width: 1080, height: even(Math.round(1080 / ratio)) };
}

/** 生成 draft_content.json 的对象形态（便于测试与二次加工）。 */
export function buildDraftContent(timeline: CapCutTimeline) {
    const totalMicros = secondsToMicros(timeline.duration);
    const videoTrackSegments = timeline.clips
        .filter((clip) => clip.track === "main")
        .map((clip, index) => ({
            id: segmentId("main", index),
            material_id: materialId(clip.fileName),
            target_timerange: { start: secondsToMicros(clip.start), duration: secondsToMicros(clip.duration) },
            source_timerange: { start: 0, duration: secondsToMicros(clip.sourceDuration ?? clip.duration) },
            speed: 1,
            volume: 1,
            visible: true,
            render_index: index,
        }));
    const audioTrackSegments = timeline.clips
        .filter((clip) => clip.track === "audio")
        .map((clip, index) => ({
            id: segmentId("audio", index),
            material_id: materialId(clip.fileName),
            target_timerange: { start: secondsToMicros(clip.start), duration: secondsToMicros(clip.duration) },
            source_timerange: { start: 0, duration: secondsToMicros(clip.sourceDuration ?? clip.duration) },
            speed: 1,
            volume: 1,
            visible: true,
            render_index: index,
        }));

    return {
        canvas_config: { width: timeline.width, height: timeline.height, ratio: "original" },
        config: {
            video_mute: false,
            record_path: "",
            /** 剪映用它区分草稿来源；留空最稳，自定义值会让某些版本提示草稿损坏。 */
            app_version: "",
            fps: timeline.fps,
            render_index_track_mode_on: true,
        },
        duration: totalMicros,
        fps: timeline.fps,
        version: 360000,
        new_version: "110.0.0",
        name: timeline.title,
        materials: {
            videos: timeline.clips
                .filter((clip) => clip.kind !== "audio")
                .map((clip) => ({
                    id: materialId(clip.fileName),
                    type: clip.kind === "image" ? "photo" : "video",
                    path: clip.fileName,
                    material_name: clip.name,
                    duration: secondsToMicros(clip.sourceDuration ?? clip.duration),
                    ...(clip.kind === "image" ? { width: timeline.width, height: timeline.height, photo_duration: secondsToMicros(clip.duration) } : { has_audio: false }),
                })),
            audios: timeline.clips
                .filter((clip) => clip.kind === "audio")
                .map((clip) => ({
                    id: materialId(clip.fileName),
                    type: "extract_music",
                    path: clip.fileName,
                    name: clip.name,
                    duration: secondsToMicros(clip.duration),
                })),
            speeds: [],
            texts: [],
            transitions: [],
        },
        tracks: [
            { id: trackId("main"), type: "video", attribute: 0, flag: 0, segments: videoTrackSegments },
            { id: trackId("audio"), type: "audio", attribute: 0, flag: 0, segments: audioTrackSegments },
        ],
    };
}

/** 草稿包里的「素材-草稿」对应关系，剪映打开目录时用得上。 */
export function buildDraftMetaInfo(timeline: CapCutTimeline) {
    return {
        draft_id: "",
        draft_name: timeline.title,
        draft_fold_path: timeline.title,
        draft_root_path: timeline.title,
        tm_draft_create: Date.now() * 1000,
        tm_draft_modified: Date.now() * 1000,
        tm_duration: secondsToMicros(timeline.duration),
        draft_materials: [
            ...timeline.clips
                .filter((clip) => clip.kind !== "audio")
                .map((clip) => ({ type: clip.kind === "image" ? 1 : 0, file_Path: clip.fileName, metetype: clip.kind === "image" ? "photo" : "video", duration: secondsToMicros(clip.sourceDuration ?? clip.duration) })),
            ...timeline.clips.filter((clip) => clip.kind === "audio").map((clip) => ({ type: 2, file_Path: clip.fileName, metetype: "music", duration: secondsToMicros(clip.duration) })),
        ],
    };
}

function isPlayableNode(node: ExportableNode) {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video) return false;
    if (!node.metadata?.storageKey) return false;
    // 只导出真正出好的内容：批量图里没成功、或还在 loading 的槽位不占时间线。
    return node.metadata.status !== "error";
}

/**
 * 有连线按拓扑深度分层，同层按画布位置排序；没有连线直接按位置排。
 * 用 Kahn 算法，遇到环时把剩下的节点按位置追加到末尾，绝不丢节点。
 * 导出时需要按同样的顺序取素材文件，所以对外暴露。
 */
export function orderTimelineNodes(nodes: ExportableNode[], connections: CanvasConnection[]) {
    const ids = new Set(nodes.map((node) => node.id));
    const edges = connections.filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId) && edge.fromNodeId !== edge.toNodeId);
    if (!edges.length) return [...nodes].sort(readingOrder);
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    edges.forEach((edge) => indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) || 0) + 1));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const ready = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).sort(readingOrder);
    const result: ExportableNode[] = [];
    while (ready.length) {
        const node = ready.shift()!;
        result.push(node);
        edges
            .filter((edge) => edge.fromNodeId === node.id)
            .forEach((edge) => {
                const next = (indegree.get(edge.toNodeId) || 0) - 1;
                indegree.set(edge.toNodeId, next);
                if (next === 0) {
                    const target = byId.get(edge.toNodeId);
                    if (target && !result.includes(target)) ready.push(target);
                }
            });
        ready.sort(readingOrder);
    }
    const rest = nodes.filter((node) => !result.includes(node)).sort(readingOrder);
    return [...result, ...rest];
}

function readingOrder(a: ExportableNode, b: ExportableNode) {
    // 先按行再按列：把 y 按 200px 分带，同一带内算一行。
    const rowA = Math.floor(a.position.y / 200);
    const rowB = Math.floor(b.position.y / 200);
    if (rowA !== rowB) return rowA - rowB;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.id.localeCompare(b.id);
}

function clipName(node: ExportableNode, index: number) {
    const title = node.title?.trim();
    return title || i18n.t("canvas.capcut.clipName", { index: index + 1 });
}

function majority(values: number[]) {
    const counts = new Map<number, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 16 / 9;
}

function finiteOr(value: number, fallback: number) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function even(value: number) {
    return value % 2 === 0 ? value : value + 1;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function safeName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "clip";
}

export function secondsToMicros(seconds: number) {
    return Math.round(seconds * TIME_BASE);
}

function materialId(fileName: string) {
    return `material-${hash(fileName)}`;
}

function segmentId(track: string, index: number) {
    return `segment-${track}-${index + 1}`;
}

function trackId(track: string) {
    return `track-${track}`;
}

/** 稳定哈希：同一个文件每次导出得到同一个 id，便于重新导出时覆盖而不是堆叠。 */
function hash(value: string) {
    let result = 0;
    for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
    return result.toString(36);
}
