// 倒计时节点:预设时长 + 暂停/继续/重置。运行态基于「截止时间戳」,
// 用 1Hz 本地时钟刷新显示;暂停/重置时才写宿主 store,避免高频重渲染。
import { definePlugin, useEffect, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function fmt(sec: number): string {
    const s = Math.max(0, Math.ceil(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    return (h > 0 ? `${h}:` : "") + `${mm}:${String(r).padStart(2, "0")}`;
}

function CountdownContent({ ctx }: CanvasNodeContentProps) {
    const running = Boolean(ctx.node.metadata?.running);
    const deadline = Number(ctx.node.metadata?.deadline) || 0;
    const remain = Number(ctx.node.metadata?.remain) || 0;

    // 本地显示用的剩余秒数:运行时每秒由时钟刷新,暂停时直接用 store 的 remain
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
        return () => window.clearInterval(timer);
    }, [running]);

    const left = running && deadline ? (deadline - Date.now()) / 1000 : remain;
    const done = left <= 0;
    const show = done ? (running ? 0 : remain) : left;

    const start = (seconds: number) => ctx.updateMetadata({ deadline: Date.now() + seconds * 1000, remain: seconds, running: true });
    const toggle = () => {
        if (running) ctx.updateMetadata({ remain: Math.max(0, (deadline - Date.now()) / 1000), running: false });
        else ctx.updateMetadata({ deadline: Date.now() + Math.max(1, remain) * 1000, running: true });
    };
    const addSeconds = (sec: number) => {
        if (running) ctx.updateMetadata({ deadline: deadline + sec * 1000, remain: remain + sec });
        else ctx.updateMetadata({ remain: Math.max(0, remain) + sec });
    };

    const btn = { padding: "5px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;

    const color = done && running ? "#f87171" : ctx.theme.node.text;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color }}>
            <div style={{ fontFamily: "Consolas, Menlo, monospace", fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: 1, color }}>
                {fmt(done ? (running ? 0 : remain) : show)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
                <button type="button" style={{ ...btn, minWidth: 62 }} onClick={toggle}>
                    {running ? "⏸ 暂停" : remain > 0 ? "▶ 继续" : "开始"}
                </button>
                <button type="button" style={btn} onClick={() => addSeconds(60)}>+1分</button>
                <button type="button" style={btn} onClick={() => addSeconds(300)}>+5分</button>
                <button type="button" style={btn} onClick={() => ctx.updateMetadata({ remain: 0, running: false, deadline: 0 })}>重置</button>
            </div>
            {done && running && <div style={{ fontSize: 13, fontWeight: 600 }}>⏰ 时间到!</div>}
        </div>
    );
}

export default definePlugin({
    id: "countdown",
    name: "倒计时节点",
    version: "1.0.0",
    description: "画布倒计时器:预设时长、暂停/继续/加时,走时钟低频刷新",
    nodes: [
        {
            type: "countdown:timer",
            title: "倒计时",
            icon: "⏱",
            description: "倒计时器",
            defaultSize: { width: 260, height: 200 },
            defaultMetadata: { remain: 0, running: false, deadline: 0 },
            minimapColor: "#ef4444",
            hidePanel: true,
            Content: CountdownContent,
            toolbar: (ctx) => [
                { id: "cd-5m", title: "设为 5 分钟并开始", label: "5 分钟", icon: "⏱", onClick: () => ctx.updateMetadata({ deadline: Date.now() + 300_000, remain: 300, running: true }) },
                { id: "cd-10m", title: "设为 10 分钟并开始", label: "10 分钟", icon: "⏱", onClick: () => ctx.updateMetadata({ deadline: Date.now() + 600_000, remain: 600, running: true }) },
                { id: "cd-25m", title: "番茄钟:25 分钟", label: "25 分钟", icon: "🍅", onClick: () => ctx.updateMetadata({ deadline: Date.now() + 1_500_000, remain: 1500, running: true }) },
            ],
        },
    ],
});
