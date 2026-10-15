// 镜头时长预算表:逐镜录入秒数,合计并与目标时长对比,纯本地计算。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Shot = { name: string; sec: number };

function parseRows(meta: unknown): Shot[] {
    if (typeof meta !== "string") return [{ name: "镜头 1", sec: 3 }];
    try {
        const v = JSON.parse(meta) as Shot[];
        return Array.isArray(v) && v.length ? v : [{ name: "镜头 1", sec: 3 }];
    } catch {
        return [{ name: "镜头 1", sec: 3 }];
    }
}

function TimingContent({ ctx }: CanvasNodeContentProps) {
    const [rows, setRows] = useState<Shot[]>(() => parseRows(ctx.node.metadata?.shots));
    const target = (ctx.node.metadata?.target as number | undefined) ?? 30;
    const save = (next: Shot[]) => {
        setRows(next);
        ctx.updateMetadata({ shots: JSON.stringify(next) });
    };
    const total = rows.reduce((n, r) => n + (Number(r.sec) || 0), 0);
    const diff = total - target;

    const btn = { padding: "3px 9px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 11 } as const;
    const input = { width: 52, padding: "3px 6px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 12 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>目标成片</span>
                {[15, 30, 60, 90].map((s) => (
                    <button key={s} type="button" onClick={() => ctx.updateMetadata({ target: s })} style={{ ...btn, background: s === target ? "rgba(99,102,241,.22)" : ctx.theme.toolbar.panel, borderColor: s === target ? "#6366f1" : ctx.theme.node.stroke }}>
                        {s}s
                    </button>
                ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                {rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                            value={r.name}
                            onChange={(e) => save(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            onWheel={stop}
                            style={{ ...input, flex: 1, width: "auto" }}
                        />
                        <input
                            type="number"
                            min={0}
                            value={r.sec}
                            onChange={(e) => save(rows.map((x, j) => (j === i ? { ...x, sec: Number(e.target.value) } : x)))}
                            onWheel={stop}
                            style={input}
                        />
                        <span style={{ fontSize: 11, opacity: 0.6 }}>秒</span>
                        <button type="button" title="删除" onClick={() => save(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)} style={{ ...btn, padding: "3px 7px" }}>✕</button>
                    </div>
                ))}
            </div>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => save([...rows, { name: `镜头 ${rows.length + 1}`, sec: 3 }])} style={btn}>＋ 添加镜头</button>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                    合计 {total}s / 目标 {target}s
                </span>
                <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, background: diff === 0 ? "rgba(34,197,94,.18)" : diff > 0 ? "rgba(239,68,68,.18)" : "rgba(234,179,8,.18)" }}>
                    {diff === 0 ? "刚好 ✓" : diff > 0 ? `超 ${diff}s` : `还差 ${-diff}s`}
                </span>
            </div>
        </div>
    );
}

export default definePlugin({
    id: "shot-timing",
    name: "镜头时长预算",
    version: "1.0.0",
    description: "逐镜录入秒数,自动合计并与目标成片时长对比,超时/欠时一目了然",
    nodes: [
        {
            type: "shot-timing:board",
            title: "时长预算",
            icon: "⏳",
            description: "镜头时长预算表:逐镜秒数合计 vs 目标时长",
            defaultSize: { width: 400, height: 380 },
            defaultMetadata: { shots: JSON.stringify([{ name: "镜头 1", sec: 3 }]), target: 30 },
            minimapColor: "#64748b",
            hidePanel: true,
            interactionToggle: true,
            Content: TimingContent,
        },
    ],
});
