import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

/** 拖动吸附的屏幕像素阈值；判定时按画布缩放换算成画布坐标。 */
export const ALIGN_SNAP_THRESHOLD_PX = 6;
/** 自动整理时相邻节点之间的间距。 */
export const ARRANGE_GAP = 56;

export type AlignmentGuides = { vertical: number[]; horizontal: number[] };

export const EMPTY_ALIGN_GUIDES: AlignmentGuides = { vertical: [], horizontal: [] };

type AxisEdges = { min: number; center: number; max: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type ArrangeUnit = { ids: string[]; bounds: Bounds };

function axisEdges(min: number, size: number): AxisEdges {
    return { min, center: min + size / 2, max: min + size };
}

function boundsOf(nodes: CanvasNodeData[]): Bounds {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

/** 在「移动集合的左/中/右」和「其它节点的左/中/右」之间找最近的一条对齐线。 */
function nearestSnap(moving: AxisEdges, others: AxisEdges[], threshold: number) {
    const from = [moving.min, moving.center, moving.max];
    const best = { delta: 0, guide: 0, distance: Infinity };
    let found = false;
    others.forEach((other) => {
        [other.min, other.center, other.max].forEach((guide) => {
            from.forEach((value) => {
                const distance = Math.abs(guide - value);
                if (distance > threshold || distance >= best.distance) return;
                best.delta = guide - value;
                best.guide = guide;
                best.distance = distance;
                found = true;
            });
        });
    });
    return found ? best : null;
}

/** 拖动时把移动集合吸附到其它节点的边或中线上，返回需要额外偏移的距离和要显示的参考线。 */
export function computeAlignmentSnap(moved: CanvasNodeData[], others: CanvasNodeData[], threshold: number): { dx: number; dy: number; guides: AlignmentGuides } {
    if (!moved.length || !others.length) return { dx: 0, dy: 0, guides: EMPTY_ALIGN_GUIDES };
    const bounds = boundsOf(moved);
    const vertical = nearestSnap(
        axisEdges(bounds.left, bounds.right - bounds.left),
        others.map((node) => axisEdges(node.position.x, node.width)),
        threshold,
    );
    const horizontal = nearestSnap(
        axisEdges(bounds.top, bounds.bottom - bounds.top),
        others.map((node) => axisEdges(node.position.y, node.height)),
        threshold,
    );
    return {
        dx: vertical?.delta ?? 0,
        dy: horizontal?.delta ?? 0,
        guides: { vertical: vertical ? [vertical.guide] : [], horizontal: horizontal ? [horizontal.guide] : [] },
    };
}

// 组节点连它的子节点一起当成一个整体，避免整理后把组框和子节点拆开。
function collectArrangeUnits(nodes: CanvasNodeData[], selectedIds: Set<string>): ArrangeUnit[] {
    const units: ArrangeUnit[] = [];
    const handled = new Set<string>();
    nodes.forEach((node) => {
        if (!selectedIds.has(node.id) || handled.has(node.id)) return;
        const members = node.type === CanvasNodeType.Group ? [node, ...nodes.filter((child) => child.metadata?.groupId === node.id)] : [node];
        members.forEach((member) => handled.add(member.id));
        units.push({ ids: members.map((member) => member.id), bounds: boundsOf(members) });
    });
    return units;
}

/** 按左上角对齐把每个整体摆到目标位置，组内成员保持相对关系。 */
function placeUnits(nodes: CanvasNodeData[], units: ArrangeUnit[], targets: { x: number; y: number }[]) {    const offsets = new Map<string, { dx: number; dy: number }>();
    units.forEach((unit, index) => {
        const dx = targets[index].x - unit.bounds.left;
        const dy = targets[index].y - unit.bounds.top;
        unit.ids.forEach((id) => offsets.set(id, { dx, dy }));
    });
    return nodes.map((node) => {
        const offset = offsets.get(node.id);
        return offset ? { ...node, position: { x: node.position.x + offset.dx, y: node.position.y + offset.dy } } : node;
    });
}

/** 把选中节点按网格重新排布，保持当前「从上到下、从左到右」的顺序。 */
export function arrangeNodesInGrid(nodes: CanvasNodeData[], selectedIds: Set<string>, gap = ARRANGE_GAP) {
    const units = collectArrangeUnits(nodes, selectedIds);
    if (units.length < 2) return null;
    const ordered = [...units].sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
    const cellWidth = Math.max(...ordered.map((unit) => unit.bounds.right - unit.bounds.left)) + gap;
    const cellHeight = Math.max(...ordered.map((unit) => unit.bounds.bottom - unit.bounds.top)) + gap;
    const columns = Math.ceil(Math.sqrt(ordered.length));
    const originX = Math.min(...ordered.map((unit) => unit.bounds.left));
    const originY = Math.min(...ordered.map((unit) => unit.bounds.top));
    const targets = ordered.map((unit, index) => ({
        x: originX + (index % columns) * cellWidth + (cellWidth - gap - (unit.bounds.right - unit.bounds.left)) / 2,
        y: originY + Math.floor(index / columns) * cellHeight + (cellHeight - gap - (unit.bounds.bottom - unit.bounds.top)) / 2,
    }));
    return placeUnits(nodes, ordered, targets);
}

/** 按连线方向从左到右分层排布；选中范围内没有连线时退回网格整理。 */
export function arrangeNodesByFlow(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedIds: Set<string>, gap = ARRANGE_GAP) {
    const units = collectArrangeUnits(nodes, selectedIds);
    if (units.length < 2) return null;
    const unitOf = new Map<string, number>();
    units.forEach((unit, index) => unit.ids.forEach((id) => unitOf.set(id, index)));
    const edges = connections.flatMap((connection) => {
        const from = unitOf.get(connection.fromNodeId);
        const to = unitOf.get(connection.toNodeId);
        return from == null || to == null || from === to ? [] : [{ from, to }];
    });
    if (!edges.length) return arrangeNodesInGrid(nodes, selectedIds, gap);

    // 层号 = 从没有上游的节点出发的最长路径长度；有环时层号不会再增长，避免死循环。
    const depth = units.map(() => 0);
    for (let round = 0; round < units.length; round += 1) {
        let changed = false;
        edges.forEach((edge) => {
            if (depth[edge.to] >= depth[edge.from] + 1) return;
            depth[edge.to] = depth[edge.from] + 1;
            changed = true;
        });
        if (!changed) break;
    }
    // 没有任何连线的节点单独放到最后一列。
    const linked = new Set<number>();
    edges.forEach((edge) => {
        linked.add(edge.from);
        linked.add(edge.to);
    });
    const lastDepth = Math.max(...depth) + 1;
    units.forEach((unit, index) => {
        if (!linked.has(index)) depth[index] = lastDepth;
    });

    const levels = Array.from(new Set(depth)).sort((a, b) => a - b);
    const targets: { x: number; y: number }[] = new Array(units.length);
    const originY = Math.min(...units.map((unit) => unit.bounds.top));
    let cursorX = Math.min(...units.map((unit) => unit.bounds.left));
    levels.forEach((level) => {
        const indexes = units.map((unit, index) => index).filter((index) => depth[index] === level);
        indexes.sort((a, b) => units[a].bounds.top - units[b].bounds.top);
        const columnWidth = Math.max(...indexes.map((index) => units[index].bounds.right - units[index].bounds.left));
        let cursorY = originY;
        indexes.forEach((index) => {
            const unit = units[index];
            targets[index] = { x: cursorX + (columnWidth - (unit.bounds.right - unit.bounds.left)) / 2, y: cursorY };
            cursorY += unit.bounds.bottom - unit.bounds.top + gap;
        });
        cursorX += columnWidth + gap;
    });
    return placeUnits(nodes, units, targets);
}

/**
 * 把选中的镜头按当前排布顺序串成一条镜头链：1→2→3。
 *
 * 用途：宫格图切出来的一堆分镜只是「摆在那儿」，导出时虽然会自动按位置排序，
 * 但在画布上仍看不出先后。串成链之后既能一眼看出镜序，也能直接顺着连线继续生成。
 *
 * 规则：
 * 1. 顺序沿用视觉阅读顺序（先按 y 分带成行、再按 x），和导出、整理用的是同一套；
 * 2. 已经首尾相连的镜头跳过，不重复加线；已有反向连线时先删掉，避免「1→2 与 2→1」同时存在；
 * 3. 只连「没有下游」的节点：如果某个镜头后面已经接了生成节点，就不再串它，免得改坏既有流程。
 */
export function chainSelectedNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedIds: Set<string>, makeId: () => string) {
    const ordered = nodes
        .filter((node) => selectedIds.has(node.id))
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (ordered.length < 2) return null;

    const kept: CanvasConnection[] = [];
    const removed: string[] = [];
    ordered.forEach((node, index) => {
        const next = ordered[index + 1];
        if (!next) return;
        const hasDownstream = connections.some((connection) => connection.fromNodeId === node.id && !selectedIds.has(connection.toNodeId));
        if (hasDownstream) return;
        const reverse = connections.find((connection) => connection.fromNodeId === next.id && connection.toNodeId === node.id);
        if (reverse) removed.push(reverse.id);
        const exists = connections.some((connection) => connection.fromNodeId === node.id && connection.toNodeId === next.id);
        if (exists) return;
        kept.push({ id: makeId(), fromNodeId: node.id, toNodeId: next.id });
    });

    const added = kept.length;
    if (!added && !removed.length) return null;
    const nextConnections = [...connections.filter((connection) => !removed.includes(connection.id)), ...kept];
    return { connections: nextConnections, added, removed: removed.length, total: ordered.length };
}
