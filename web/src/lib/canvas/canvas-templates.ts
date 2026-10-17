import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

/** 画布模板：只保存「结构 + 提示词」，不保存图片/视频本体，避免模板库把 IndexedDB 撑爆。 */
export type CanvasTemplate = {
    id: string;
    name: string;
    createdAt: number;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

const MEDIA_TYPES = new Set<string>([CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio]);

/** 清掉媒体节点的运行态与内容，保留模型、尺寸、提示词等可复用的生成参数。 */
function sanitizeNode(node: CanvasNodeData): CanvasNodeData {
    const metadata = { ...node.metadata };
    if (MEDIA_TYPES.has(node.type)) {
        metadata.content = "";
        metadata.status = "idle";
        delete metadata.errorDetails;
        delete metadata.images;
        delete metadata.primaryImageId;
        delete metadata.imageTaskId;
        delete metadata.videoTaskId;
    }
    return { ...node, metadata };
}

/** 从当前画布圈选一片节点生成模板；位置归一到左上角为原点。 */
export function buildCanvasTemplate(input: {
    name: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodeIds: string[];
    id?: string;
    now?: number;
}): CanvasTemplate | null {
    const picked = new Set(input.nodeIds);
    const nodes = input.nodes.filter((node) => picked.has(node.id));
    if (!nodes.length) return null;
    const minX = Math.min(...nodes.map((node) => node.position.x));
    const minY = Math.min(...nodes.map((node) => node.position.y));
    return {
        id: input.id || nanoid(),
        name: input.name.trim() || "未命名模板",
        createdAt: input.now ?? Date.now(),
        nodes: nodes.map((node) => ({ ...sanitizeNode(node), position: { x: node.position.x - minX, y: node.position.y - minY } })),
        connections: input.connections.filter((conn) => picked.has(conn.fromNodeId) && picked.has(conn.toNodeId)).map((conn) => ({ ...conn })),
    };
}

/** 把模板实例化到指定原点：全部节点换新 id，连线与分组引用同步改写。 */
export function instantiateCanvasTemplate(template: CanvasTemplate, origin: { x: number; y: number }) {
    const idMap = new Map<string, string>();
    template.nodes.forEach((node) => idMap.set(node.id, `${node.type}-${nanoid(8)}`));
    const nodes: CanvasNodeData[] = template.nodes.map((node) => {
        const groupId = node.metadata?.groupId;
        const metadata = { ...node.metadata };
        if (groupId && idMap.has(groupId)) metadata.groupId = idMap.get(groupId);
        else if (groupId) delete metadata.groupId;
        return { ...node, id: idMap.get(node.id) as string, position: { x: origin.x + node.position.x, y: origin.y + node.position.y }, metadata };
    });
    const connections: CanvasConnection[] = template.connections
        .map((conn) => ({ ...conn, id: nanoid(), fromNodeId: idMap.get(conn.fromNodeId) as string, toNodeId: idMap.get(conn.toNodeId) as string }))
        .filter((conn) => Boolean(conn.fromNodeId && conn.toNodeId));
    return { nodes, connections };
}

/** 模板插入位置：放到现有内容右侧，避免盖住已有节点。 */
export function templateInsertOrigin(nodes: CanvasNodeData[], gap = 120) {
    if (!nodes.length) return { x: 0, y: 0 };
    return { x: Math.max(...nodes.map((node) => node.position.x + node.width)) + gap, y: Math.min(...nodes.map((node) => node.position.y)) };
}
