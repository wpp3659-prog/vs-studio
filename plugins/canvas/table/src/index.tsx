// 表格节点:可编辑小型表格,增删行列,输出 CSV。
import { definePlugin } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Row = string[];

function normalize(rows: unknown): Row[] {
    if (!Array.isArray(rows) || rows.length === 0) return [["", ""], ["", ""]];
    return rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [""]));
}

function TableContent({ ctx }: CanvasNodeContentProps) {
    const rows = normalize(ctx.node.metadata?.rows);
    const setRows = (next: Row[]) => ctx.updateMetadata({ rows: next });

    const setCell = (r: number, c: number, value: string) => {
        const next = rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row));
        setRows(next);
    };

    const cellInput = {
        width: "100%", border: "none", outline: "none", background: "transparent",
        color: ctx.theme.node.text, fontSize: 13, padding: "6px 8px", boxSizing: "border-box",
        fontFamily: "inherit", minWidth: 70,
    } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", width: "100%", overflow: "auto", boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text }}>
            <table style={{ borderCollapse: "collapse", width: "100%", height: "100%", tableLayout: "auto" }}>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={ri}>
                            {row.map((cell, ci) => (
                                <td key={ci} style={{ border: `1px solid ${ctx.theme.node.stroke}`, padding: 0, background: ri === 0 ? ctx.theme.toolbar.panel : "transparent" }}>
                                    <input value={cell} placeholder={ri === 0 && ci === 0 ? "表头…" : ""} onChange={(e) => setCell(ri, ci, e.target.value)} onWheel={stop} style={cellInput} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default definePlugin({
    id: "table",
    name: "表格节点",
    version: "1.0.0",
    description: "画布内直接编辑的表格,支持增删行列,可输出 CSV",
    nodes: [
        {
            type: "table:grid",
            title: "表格",
            icon: "📋",
            description: "可编辑表格",
            defaultSize: { width: 360, height: 240 },
            defaultMetadata: { rows: [["列 A", "列 B"], ["", ""]] },
            minimapColor: "#3b82f6",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const rows = normalize(node.metadata?.rows);
                const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
                return { kind: "text", text: csv };
            },
            Content: TableContent,
            toolbar: (ctx) => {
                const rows = normalize(ctx.node.metadata?.rows);
                const cols = rows[0]?.length ?? 0;
                return [
                    { id: "tbl-add-row", title: "在末尾加一行", label: "加行", icon: "➕", onClick: () => ctx.updateMetadata({ rows: [...rows, new Array(cols).fill("")] }) },
                    { id: "tbl-add-col", title: "在末尾加一列", label: "加列", icon: "➕", onClick: () => ctx.updateMetadata({ rows: rows.map((r) => [...r, ""]) }) },
                    { id: "tbl-del-row", title: "删除最后一行", label: "删行", icon: "➖", onClick: () => rows.length > 1 && ctx.updateMetadata({ rows: rows.slice(0, -1) }) },
                    { id: "tbl-del-col", title: "删除最后一列", label: "删列", icon: "➖", onClick: () => cols > 1 && ctx.updateMetadata({ rows: rows.map((r) => r.slice(0, -1)) }) },
                    { id: "tbl-clear", title: "清空所有内容(保留表格结构)", label: "清空", icon: "🧹", onClick: () => ctx.updateMetadata({ rows: rows.map((r) => r.map(() => "")) }) },
                ];
            },
        },
    ],
});
