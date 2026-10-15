// 画幅预览节点:按选定画幅(16:9 / 9:16 / 1:1 / 2.39:1 / 4:5)显示安全框,
// 含动作安全区(93%)与字幕安全区(80%),用于 TVC/短视频多平台画幅规划。
import { definePlugin, useEffect, useRef, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const RATIOS: { label: string; w: number; h: number }[] = [
    { label: "16:9 横屏", w: 16, h: 9 },
    { label: "9:16 竖屏", w: 9, h: 16 },
    { label: "1:1 方形", w: 1, h: 1 },
    { label: "2.39:1 电影宽幅", w: 2.39, h: 1 },
    { label: "4:5 社媒", w: 4, h: 5 },
];

function FrameContent({ ctx }: CanvasNodeContentProps) {
    const ratio = (ctx.node.metadata?.ratio as string | undefined) || "16:9";
    const title = (ctx.node.metadata?.title as string | undefined) || "";
    const showSafe = ctx.node.metadata?.safe !== false;
    const boxRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const r = RATIOS.find((x) => x.label === ratio) || RATIOS[0];
    const fit = Math.min(box.w / r.w, box.h / r.h);
    const fw = Math.max(0, r.w * fit);
    const fh = Math.max(0, r.h * fit);

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: 10, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            <input
                value={title}
                placeholder="画幅备注,如「抖音竖版 30s」"
                onChange={(e) => ctx.updateMetadata({ title: e.target.value })}
                onWheel={stop}
                style={{ flexShrink: 0, padding: "4px 8px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 }}
            />
            <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.25)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ position: "relative", width: fw, height: fh, background: "rgba(99,102,241,.10)", border: "1.5px solid rgba(99,102,241,.8)", borderRadius: 2 }}>
                    {showSafe && (
                        <>
                            {/* 动作安全区 93% */}
                            <div style={{ position: "absolute", inset: "3.5%", border: "1px dashed rgba(255,255,255,.35)" }} />
                            {/* 字幕安全区 80% */}
                            <div style={{ position: "absolute", inset: "10%", border: "1px dashed rgba(255,255,255,.2)" }} />
                            <div style={{ position: "absolute", bottom: "10.5%", left: "10%", fontSize: 9, color: "rgba(255,255,255,.45)" }}>字幕安全区</div>
                        </>
                    )}
                    <div style={{ position: "absolute", top: 4, left: 6, fontSize: 10, fontWeight: 600, color: "rgba(99,102,241,.9)" }}>{r.label}</div>
                </div>
            </div>
        </div>
    );
}

export default definePlugin({
    id: "aspect-frame",
    name: "画幅预览节点",
    version: "1.0.0",
    description: "按画幅显示安全框(动作区/字幕区),规划横屏/竖屏/宽银幕多版本",
    nodes: [
        {
            type: "aspect-frame:frame",
            title: "画幅",
            icon: "🖼",
            description: "画幅安全框预览",
            defaultSize: { width: 320, height: 260 },
            defaultMetadata: { ratio: "16:9", title: "", safe: true },
            minimapColor: "#0ea5e9",
            hidePanel: true,
            Content: FrameContent,
            toolbar: (ctx) => {
                const current = (ctx.node.metadata?.ratio as string | undefined) || "16:9";
                return RATIOS.map((r) => ({
                    id: `ratio-${r.label}`,
                    title: `切换为 ${r.label}`,
                    label: r.label.split(" ")[0],
                    icon: current === r.label ? "✓" : "▭",
                    active: current === r.label,
                    onClick: () => ctx.updateMetadata({ ratio: r.label }),
                }));
            },
        },
    ],
});
