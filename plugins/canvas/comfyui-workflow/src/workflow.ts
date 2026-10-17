// ComfyUI 工作流(API 格式)的解析与改写。
// 全部是纯函数:不碰 DOM、不发请求,方便单独验证。
// 这里只认 ComfyUI 的 API 格式(节点 id → {class_type, inputs}),界面格式(带 nodes/links)直接拒绝。

export type WorkflowNode = {
    id: string;
    classType: string;
    title: string;
    text: string; // inputs.text 当前值(没有则为空)
    image: string; // inputs.image 当前值(LoadImage 的文件名)
    hasText: boolean;
    hasImage: boolean;
};

export type ParsedWorkflow = {
    nodes: WorkflowNode[];
    promptNodes: WorkflowNode[]; // 可以写入提示词的节点
    imageNodes: WorkflowNode[]; // 可以写入图片文件名的节点
};

export type ComfyImage = { filename: string; subfolder: string; type: string };

type WorkflowJson = Record<string, { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }>;

export function parseWorkflow(raw: string): ParsedWorkflow {
    const text = (raw || "").trim();
    if (!text) throw new Error("请先粘贴工作流 JSON");
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("不是合法 JSON,请确认复制完整");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("工作流 JSON 顶层必须是对象");
    if (Array.isArray((data as { nodes?: unknown }).nodes)) {
        throw new Error("这是界面格式工作流,请在 ComfyUI 里用「导出(API)」重新导出");
    }
    const graph = data as WorkflowJson;
    const nodes: WorkflowNode[] = [];
    for (const [id, value] of Object.entries(graph)) {
        if (!value || typeof value !== "object" || typeof value.class_type !== "string") continue;
        const inputs = (value.inputs || {}) as Record<string, unknown>;
        const textValue = inputs.text;
        const imageValue = inputs.image;
        nodes.push({
            id,
            classType: value.class_type,
            title: typeof value._meta?.title === "string" ? value._meta.title : "",
            text: typeof textValue === "string" ? textValue : "",
            image: typeof imageValue === "string" ? imageValue : "",
            hasText: typeof textValue === "string",
            hasImage: typeof imageValue === "string",
        });
    }
    if (!nodes.length) throw new Error("工作流里没有可识别的节点");
    return { nodes, promptNodes: nodes.filter((n) => n.hasText), imageNodes: nodes.filter((n) => n.hasImage) };
}

/** 节点下拉里的展示文案:优先用节点自定义标题,其次是类型名。 */
export function nodeLabel(node: WorkflowNode): string {
    const name = node.title || node.classType;
    return `${node.id} · ${name}`;
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/** 把提示词写进指定节点的 text 输入,返回新的工作流对象(不改原对象)。 */
export function applyPrompt(workflow: Record<string, unknown>, nodeId: string, prompt: string): Record<string, unknown> {
    const next = clone(workflow);
    const node = next[nodeId] as { inputs?: Record<string, unknown> } | undefined;
    if (!node) throw new Error(`工作流里找不到节点 ${nodeId}`);
    node.inputs = { ...(node.inputs || {}), text: prompt };
    return next;
}

/** 把图片文件名写进指定节点的 image 输入(LoadImage 之类)。 */
export function applyImage(workflow: Record<string, unknown>, nodeId: string, filename: string): Record<string, unknown> {
    const next = clone(workflow);
    const node = next[nodeId] as { inputs?: Record<string, unknown> } | undefined;
    if (!node) throw new Error(`工作流里找不到节点 ${nodeId}`);
    node.inputs = { ...(node.inputs || {}), image: filename };
    return next;
}

/** 从 /history 的条目里收集所有产出图片。 */
export function extractImages(entry: unknown): ComfyImage[] {
    const outputs = (entry as { outputs?: Record<string, unknown> } | null)?.outputs;
    if (!outputs || typeof outputs !== "object") return [];
    const images: ComfyImage[] = [];
    for (const value of Object.values(outputs)) {
        const list = (value as { images?: unknown } | null)?.images;
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const image = item as Partial<ComfyImage> | null;
            if (!image || typeof image.filename !== "string" || !image.filename) continue;
            images.push({
                filename: image.filename,
                subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
                type: typeof image.type === "string" ? image.type : "output",
            });
        }
    }
    return images;
}

/** 历史条目里的失败原因;没失败返回空串。 */
export function historyError(entry: unknown): string {
    const status = (entry as { status?: { status_str?: string; messages?: unknown[] } } | null)?.status;
    if (!status || status.status_str !== "error") return "";
    const messages = Array.isArray(status.messages) ? status.messages : [];
    for (const message of messages) {
        if (!Array.isArray(message)) continue;
        const detail = message[1] as { node_type?: string; exception_message?: string } | undefined;
        if (detail?.exception_message) return `${detail.node_type || "节点"}: ${detail.exception_message}`.trim();
    }
    return "执行失败(ComfyUI 未返回具体原因)";
}

/** 取图地址。/view 必须带 filename + subfolder + type 三个参数。 */
export function viewUrl(base: string, image: ComfyImage): string {
    const query = `filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${encodeURIComponent(image.type)}`;
    return `${base.replace(/\/+$/, "")}/view?${query}`;
}
