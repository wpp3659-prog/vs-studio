// 待办清单节点:回车添加、勾选完成、删除条目、清除已完成。
import { definePlugin, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Item = { id: number; text: string; done: boolean };

function normalizeItems(raw: unknown): Item[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((it) => it && typeof it === "object")
        .map((it, i) => ({ id: Number((it as Item).id) || i, text: String((it as Item).text ?? ""), done: Boolean((it as Item).done) }));
}

let nextId = 1;

function TodoContent({ ctx }: CanvasNodeContentProps) {
    const [draft, setDraft] = useState("");
    const items = normalizeItems(ctx.node.metadata?.items);
    const setItems = (next: Item[]) => ctx.updateMetadata({ items: next });

    const addItem = () => {
        const text = draft.trim();
        if (!text) return;
        setItems([...items, { id: Date.now() + nextId++, text, done: false }]);
        setDraft("");
    };

    const doneCount = items.filter((it) => it.done).length;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", gap: 6, background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            <div style={{ flex: 1, overflow: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {items.length === 0 && <div style={{ color: ctx.theme.node.placeholder, fontSize: 13 }}>在下方输入框回车添加待办…</div>}
                {items.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 8, background: it.done ? "rgba(127,127,127,.08)" : "transparent" }}>
                        <button
                            type="button"
                            title={it.done ? "标记为未完成" : "标记为已完成"}
                            onClick={() => setItems(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                            style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, border: `1.5px solid ${it.done ? "#10b981" : ctx.theme.node.stroke}`, background: it.done ? "#10b981" : "transparent", color: "#fff", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0 }}
                        >
                            {it.done ? "✓" : ""}
                        </button>
                        <span style={{ flex: 1, fontSize: 14, textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.55 : 1, wordBreak: "break-word" }}>{it.text}</span>
                        <button type="button" title="删除" onClick={() => setItems(items.filter((x) => x.id !== it.id))} style={{ flexShrink: 0, border: "none", background: "transparent", color: ctx.theme.node.placeholder, cursor: "pointer", fontSize: 13, padding: "0 4px" }}>
                            ✕
                        </button>
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                    value={draft}
                    placeholder="添加待办,回车确认"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.stopPropagation();
                            addItem();
                        }
                    }}
                    onWheel={stop}
                    style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, outline: "none", fontSize: 13, boxSizing: "border-box" }}
                />
                {doneCount > 0 && (
                    <button type="button" title="清除已完成" onClick={() => setItems(items.filter((x) => !x.done))} style={{ flexShrink: 0, padding: "5px 8px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 }}>
                        清除{doneCount}项
                    </button>
                )}
            </div>
        </div>
    );
}

export default definePlugin({
    id: "todo-list",
    name: "待办清单节点",
    version: "1.0.0",
    description: "勾选式待办清单:回车添加、点击完成、一键清除已完成项",
    nodes: [
        {
            type: "todo-list:checklist",
            title: "待办清单",
            icon: "✅",
            description: "勾选式待办清单",
            defaultSize: { width: 300, height: 260 },
            defaultMetadata: { items: [] },
            minimapColor: "#22c55e",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const items = normalizeItems(node.metadata?.items);
                const open = items.filter((x) => !x.done);
                const closed = items.filter((x) => x.done);
                const lines = [...open.map((x) => `[ ] ${x.text}`), ...closed.map((x) => `[x] ${x.text}`)];
                return { kind: "text", text: lines.join("\n") };
            },
            Content: TodoContent,
            toolbar: (ctx) => [
                {
                    id: "todo-clear-done",
                    title: "清除所有已完成条目",
                    label: "清除已完成",
                    icon: "🧹",
                    onClick: () => ctx.updateMetadata({ items: normalizeItems(ctx.node.metadata?.items).filter((x) => !x.done) }),
                },
                {
                    id: "todo-clear-all",
                    title: "清空全部条目",
                    label: "清空",
                    icon: "🗑",
                    onClick: () => ctx.updateMetadata({ items: [] }),
                },
            ],
        },
    ],
});
