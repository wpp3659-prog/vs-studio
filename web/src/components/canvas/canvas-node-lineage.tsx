import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const MAX_DEPTH = 4;

type LineageItem = { node: CanvasNodeData; depth: number };

/** 沿连线往一个方向走，返回带层级的节点列表（同一节点只出现一次，避免环）。 */
function walk(start: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], direction: "upstream" | "downstream"): LineageItem[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const seen = new Set([start.id]);
    const result: LineageItem[] = [];
    let frontier: { id: string; depth: number }[] = [{ id: start.id, depth: 0 }];
    while (frontier.length) {
        const next: { id: string; depth: number }[] = [];
        for (const item of frontier) {
            if (item.depth >= MAX_DEPTH) continue;
            const neighbours = connections
                .filter((edge) => (direction === "upstream" ? edge.toNodeId === item.id : edge.fromNodeId === item.id))
                .map((edge) => (direction === "upstream" ? edge.fromNodeId : edge.toNodeId));
            for (const id of neighbours) {
                if (seen.has(id)) continue;
                seen.add(id);
                const node = byId.get(id);
                if (!node) continue;
                result.push({ node, depth: item.depth + 1 });
                next.push({ id, depth: item.depth + 1 });
            }
        }
        frontier = next;
    }
    return result;
}

/** 来源链：把「这张图是从哪来的、又被谁用了」按连线展开，点击可直接跳到对应节点。 */
export function CanvasNodeLineage({ node, nodes, connections, onSelectNode }: { node: CanvasNodeData; nodes: CanvasNodeData[]; connections: CanvasConnection[]; onSelectNode: (id: string) => void }) {
    const { t } = useTranslation();
    const upstream = useMemo(() => walk(node, nodes, connections, "upstream"), [node, nodes, connections]);
    const downstream = useMemo(() => walk(node, nodes, connections, "downstream"), [node, nodes, connections]);

    const typeLabel = (item: CanvasNodeData) => {
        if (item.type === CanvasNodeType.Group) return t("canvas.node.group");
        if (item.type === CanvasNodeType.Config) return t("canvas.configNode.title");
        if ([CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text].includes(item.type as CanvasNodeType)) return t(`assets.kinds.${item.type}`);
        return item.type;
    };

    const row = ({ node: item, depth }: LineageItem, keyPrefix: string) => (
        <button
            key={`${keyPrefix}-${item.id}`}
            type="button"
            onClick={() => onSelectNode(item.id)}
            className="flex w-full items-start gap-2 rounded-lg py-1.5 pr-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ paddingLeft: 8 + (depth - 1) * 14 }}
        >
            <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-stone-400">{depth}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{item.title || t("canvas.node.untitled")}</span>
                <span className="block truncate text-[11px] text-stone-400">
                    {typeLabel(item)}
                    {item.metadata?.prompt ? ` · ${item.metadata.prompt}` : item.metadata?.content && item.type === CanvasNodeType.Text ? ` · ${String(item.metadata.content).slice(0, 40)}` : ""}
                </span>
            </span>
        </button>
    );

    const section = (title: string, items: LineageItem[], key: string) => (
        <div>
            <div className="mb-1 text-xs font-medium text-stone-500">{title}</div>
            {items.length ? items.map((item) => row(item, key)) : <div className="px-2 py-1 text-[12px] text-stone-400">{t("canvas.nodeToolbar.lineageEmpty")}</div>}
        </div>
    );

    return (
        <div className="thin-scrollbar h-full space-y-4 overflow-auto pr-1">
            <div>
                <div className="mb-1 text-xs font-medium text-stone-500">{t("canvas.nodeToolbar.lineageSelf")}</div>
                <div className="rounded-lg border px-2 py-1.5 text-[13px]" style={{ borderColor: "rgba(120,113,108,.25)" }}>
                    {node.title || t("canvas.node.untitled")}
                    <span className="ml-2 text-[11px] text-stone-400">{typeLabel(node)}</span>
                </div>
            </div>
            {section(t("canvas.nodeToolbar.lineageUpstream"), upstream, "up")}
            {section(t("canvas.nodeToolbar.lineageDownstream"), downstream, "down")}
            <div className="text-[11px] text-stone-400">{t("canvas.nodeToolbar.lineageHint")}</div>
        </div>
    );
}
