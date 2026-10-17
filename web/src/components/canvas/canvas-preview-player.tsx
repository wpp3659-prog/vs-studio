import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { orderTimelineNodes } from "@/lib/canvas/capcut-draft";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

/** 图片默认停留时长，与导出剪映草稿保持一致。 */
const IMAGE_SECONDS = 3;
const TICK_MS = 100;

type PreviewClip = { nodeId: string; title: string; kind: "image" | "video"; durationMs: number; storageKey: string };

/** 成片预览：把画布上的图片/视频按导出顺序连起来播放，用来快速确认镜头节奏。 */
export function CanvasPreviewPlayer({ open, nodes, connections, onClose }: { open: boolean; nodes: CanvasNodeData[]; connections: CanvasConnection[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [sources, setSources] = useState<string[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);

    // 顺序与导出完全一致：有连线按拓扑顺序，没连线按画布阅读顺序。
    const clips = useMemo<PreviewClip[]>(() => {
        const playable = nodes.filter((node) => (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.storageKey && node.metadata?.status !== "error");
        return orderTimelineNodes(playable, connections).map((node) => {
            const seconds = Number(node.metadata?.durationMs) / 1000;
            const duration = node.type === CanvasNodeType.Video ? Math.max(0.5, Number.isFinite(seconds) && seconds > 0 ? seconds : 5) : IMAGE_SECONDS;
            return { nodeId: node.id, title: node.title || "", kind: node.type === CanvasNodeType.Video ? "video" : "image", durationMs: duration * 1000, storageKey: String(node.metadata?.storageKey || "") };
        });
    }, [nodes, connections]);

    // 打开时把媒体从本地存储取出来换成可直接播放的地址。
    useEffect(() => {
        if (!open) return;
        let alive = true;
        void Promise.all(clips.map((clip) => (clip.storageKey.startsWith("image:") ? resolveImageUrl(clip.storageKey) : resolveMediaUrl(clip.storageKey)))).then((urls) => {
            if (alive) setSources(urls);
        });
        return () => {
            alive = false;
        };
    }, [open, clips]);

    // 每次打开都从第一个镜头开始。
    useEffect(() => {
        if (!open) return;
        setIndex(0);
        setElapsed(0);
        setPlaying(true);
    }, [open]);

    const clip = clips[index];
    const total = clips.reduce((sum, item) => sum + item.durationMs, 0);
    const offset = clips.slice(0, index).reduce((sum, item) => sum + item.durationMs, 0);

    const jump = (target: number) => {
        if (!clips.length) return;
        const next = Math.min(Math.max(target, 0), clips.length - 1);
        setIndex(next);
        setElapsed(0);
        setPlaying(true);
    };

    // 图片靠计时器推进；视频由 video 自己的 timeupdate 回报进度。
    useEffect(() => {
        if (!open || !playing || !clip) return;
        const timer = window.setInterval(() => {
            const video = videoRef.current;
            if (clip.kind === "video") {
                if (!video) return;
                if (video.ended) {
                    if (index < clips.length - 1) jump(index + 1);
                    else setPlaying(false);
                    return;
                }
                setElapsed(video.currentTime * 1000);
                return;
            }
            setElapsed((prev) => prev + TICK_MS);
        }, TICK_MS);
        return () => window.clearInterval(timer);
    }, [open, playing, clip, index, clips.length]);

    // 暂停/继续要真的作用到 video 元素上（autoPlay 只在挂载时生效一次）。
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (playing) void video.play().catch(() => undefined);
        else video.pause();
    }, [playing, index, sources]);

    // 图片镜头播完自动进下一个；视频镜头交给 onEnded，避免用估算时长把视频切短。
    useEffect(() => {
        if (!open || !clip || !playing || clip.kind === "video") return;
        if (elapsed < clip.durationMs) return;
        if (index < clips.length - 1) {
            setIndex(index + 1);
            setElapsed(0);
            return;
        }
        setElapsed(clip.durationMs);
        setPlaying(false);
    }, [open, elapsed, clip, index, clips.length, playing]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            else if (event.key === " ") {
                event.preventDefault();
                setPlaying((prev) => !prev);
            } else if (event.key === "ArrowLeft") jump(index - 1);
            else if (event.key === "ArrowRight") jump(index + 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const formatTime = (ms: number) => {
        const seconds = Math.max(0, ms) / 1000;
        return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} centered width={880} destroyOnHidden title={t("canvas.preview.title")} styles={{ body: { padding: 0 } }}>
            <div className="bg-black">
                <div className="relative flex h-[420px] items-center justify-center overflow-hidden">
                    {clip && sources[index] ? (
                        clip.kind === "video" ? (
                            <video
                                key={clip.nodeId}
                                ref={videoRef}
                                src={sources[index]}
                                autoPlay={playing}
                                playsInline
                                className="h-full w-full object-contain"
                                onEnded={() => (index < clips.length - 1 ? jump(index + 1) : setPlaying(false))}
                            />
                        ) : (
                            <img key={clip.nodeId} src={sources[index]} alt={clip.title} className="h-full w-full object-contain" />
                        )
                    ) : (
                        <span className="text-sm text-white/60">{clips.length ? t("canvas.preview.loading") : t("canvas.preview.empty")}</span>
                    )}
                    {clip ? (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 text-white">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{clip.title || t("canvas.preview.shot", { index: index + 1 })}</div>
                                <div className="text-xs text-white/60">{t("canvas.preview.shot", { index: index + 1 })} / {clips.length}</div>
                            </div>
                            <div className="shrink-0 text-xs tabular-nums text-white/70">{formatTime(offset + Math.min(elapsed, clip.durationMs))} / {formatTime(total)}</div>
                        </div>
                    ) : null}
                </div>

                <div className="flex gap-1 px-3 pt-3">
                    {clips.map((item, itemIndex) => (
                        <button
                            key={item.nodeId}
                            type="button"
                            onClick={() => jump(itemIndex)}
                            title={item.title || t("canvas.preview.shot", { index: itemIndex + 1 })}
                            className="group relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
                            style={{ flexGrow: Math.max(0.6, item.durationMs / 1000) }}
                        >
                            <span className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: itemIndex < index ? "100%" : itemIndex === index ? `${Math.min(100, (elapsed / item.durationMs) * 100)}%` : "0%" }} />
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-center gap-2 px-3 py-3">
                    <button type="button" onClick={() => jump(index - 1)} disabled={index === 0} className="rounded-lg p-2 text-white/80 hover:bg-white/10 disabled:opacity-30">
                        <ChevronLeft className="size-5" />
                    </button>
                    <button type="button" onClick={() => setPlaying(!playing)} disabled={!clips.length} className="rounded-full bg-white p-2.5 text-black hover:bg-white/90 disabled:opacity-40">
                        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
                    </button>
                    <button type="button" onClick={() => jump(index + 1)} disabled={index >= clips.length - 1} className="rounded-lg p-2 text-white/80 hover:bg-white/10 disabled:opacity-30">
                        <ChevronRight className="size-5" />
                    </button>
                </div>
            </div>
        </Modal>
    );
}
