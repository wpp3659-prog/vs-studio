import { nanoid } from "nanoid";

import { flushCanvasPersist, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { uploadImage } from "@/services/image-storage";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import type { CanvasNodeImage } from "@/types/canvas";

const NODE_STATUS_SUCCESS = "success" as const;

/**
 * 把 Agent 那边取回的生成结果写回画布。
 *
 * 画布本身可能已经被刷新过，所以这里只按节点 id / 槽位 id 从 store 里找节点，
 * 找不到就安静跳过（用户可能已经删了这格）。
 */
export async function applyMediaJobResult(options: { projectId: string; nodeId: string; imageId?: string; dataUrl: string }) {
    const project = useCanvasStore.getState().projects.find((item) => item.id === options.projectId);
    const node = project?.nodes.find((item) => item.id === options.nodeId);
    if (!project || !node) return;
    const uploaded = await uploadImage(options.dataUrl);
    const image: CanvasNodeImage = {
        id: options.imageId || nanoid(),
        status: NODE_STATUS_SUCCESS,
        content: uploaded.url,
        storageKey: uploaded.storageKey,
        naturalWidth: uploaded.width,
        naturalHeight: uploaded.height,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
    };
    const slots = node.metadata?.images || [];
    // 节点整体重试时只有一格在等结果；多格同时生成时每格各自等自己的任务。
    const isSingleSlot = slots.filter((slot) => slot.status === "loading").length <= 1;
    const keepImageTaskId = slots.some((slot) => slot.id !== image.id && slot.batchItemId);

    useCanvasStore.getState().updateProject(project.id, {
        nodes: project.nodes.map((item) => {
            if (item.id !== node.id) return item;
            const current = item.metadata?.images || [];
            const hasSlot = current.some((slot) => slot.id === image.id);
            const images = hasSlot ? current.map((slot) => (slot.id === image.id ? image : slot)) : [...current, image];
            const isPrimary = !item.metadata?.content || item.metadata?.primaryImageId === image.id || isSingleSlot;
            return {
                ...item,
                ...(isPrimary ? fitNodeSize(uploaded.width, uploaded.height) : {}),
                metadata: {
                    ...item.metadata,
                    images,
                    // 还有别的格子挂着任务号就留着，等那张回来再清。
                    imageTaskId: keepImageTaskId ? item.metadata?.imageTaskId : undefined,
                    ...(isPrimary
                        ? {
                              content: image.content,
                              storageKey: image.storageKey,
                              naturalWidth: image.naturalWidth,
                              naturalHeight: image.naturalHeight,
                              bytes: image.bytes,
                              mimeType: image.mimeType,
                              primaryImageId: image.id,
                          }
                        : {}),
                },
            };
        }),
    });
    flushCanvasPersist();
}
