// ComfyUI 工作流节点:把本机/局域网 ComfyUI 的 API 格式工作流接进画布。
// 用法:粘贴「导出(API)」得到的 JSON → 选提示词节点 → 输入提示词 → 运行 → 结果直接落到画布。
// 上游有图片节点时可以把它上传到 ComfyUI 当输入图(图生图/重绘链路)。
import { definePlugin, useEffect, useMemo, useRef, useState } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";
import { applyImage, applyPrompt, extractImages, historyError, nodeLabel, parseWorkflow, viewUrl } from "./workflow";
import type { ComfyImage } from "./workflow";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

// 本地转发代理:画布自带 canvas-proxy,给 ComfyUI 这类不带 CORS 头的本地服务补跨域。
const PROXY_BASE = "http://127.0.0.1:23210";
// ComfyUI 的 /history 只有在任务结束后才有条目,1.5 秒轮一次足够;
// 上限与生图一致取 10 分钟,超时只报错不自动重发(避免重复占用显卡)。
const POLL_MS = 1500;
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RESULTS = 8;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(blob);
    });
}

function ComfyWorkflowContent({ ctx }: CanvasNodeContentProps) {
    const meta = ctx.node.metadata || {};
    const server = (meta.server as string | undefined) || "http://127.0.0.1:8188";
    const proxy = (meta.proxy as boolean | undefined) ?? true;
    const workflow = (meta.workflow as string | undefined) || "";
    const promptNodeId = (meta.promptNodeId as string | undefined) || "";
    const imageNodeId = (meta.imageNodeId as string | undefined) || "";
    const prompt = (meta.prompt as string | undefined) || "";
    const useUpstreamImage = (meta.useUpstreamImage as boolean | undefined) ?? false;
    const results = (meta.results as string[] | undefined) || [];

    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState("");
    const [error, setError] = useState((meta.error as string | undefined) || "");
    const [settingsOpen, setSettingsOpen] = useState(!workflow);
    const [connection, setConnection] = useState("");
    const cancelled = useRef(false);
    const set = (patch: Record<string, unknown>) => ctx.updateMetadata(patch);

    // 卸载(或节点被删)时停掉轮询,避免后台继续占显卡。
    useEffect(() => {
        return () => {
            cancelled.current = true;
        };
    }, []);

    const base = server.trim().replace(/\/+$/, "");
    const endpoint = (path: string) => (proxy ? `${PROXY_BASE}/${base}${path}` : `${base}${path}`);

    const call = async (path: string, init?: RequestInit) => {
        try {
            return await fetch(endpoint(path), init);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            const hint = proxy ? "" : ",可在设置里打开「走本地代理」";
            throw new Error(`连不上 ComfyUI(${base}):${reason}${hint}`);
        }
    };

    // 工作流 JSON 可能有上百 KB,按内容缓存解析结果,避免每次输入提示词都重解析。
    const parsed = useMemo(() => {
        try {
            return workflow ? parseWorkflow(workflow) : null;
        } catch {
            return null;
        }
    }, [workflow]);

    const upstreamImage = (() => {
        const node = ctx.getUpstream().find((n) => typeof n.metadata?.content === "string" && /^(data:|blob:|https?:)/.test(n.metadata.content as string));
        return node ? (node.metadata?.content as string) : "";
    })();
    const upstreamText = (() => {
        const node = ctx.getUpstream().find((n) => n.type === "text" && typeof n.metadata?.content === "string" && (n.metadata.content as string).trim());
        return node ? (node.metadata?.content as string) : "";
    })();

    const testConnection = async () => {
        setConnection("连接中…");
        try {
            const response = await call("/system_stats");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as { system?: { comfyui_version?: string }; devices?: { name?: string }[] };
            const version = data.system?.comfyui_version ? `v${data.system.comfyui_version}` : "已连接";
            const device = data.devices?.[0]?.name;
            setConnection(device ? `${version} · ${device}` : version);
        } catch (err) {
            setConnection(`✗ ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const uploadUpstream = async (): Promise<string> => {
        const source = upstreamImage;
        if (!source) throw new Error("上游没有可用的图片节点");
        const blob = await (await fetch(source)).blob();
        const form = new FormData();
        form.append("image", blob, `canvas-${Date.now()}.png`);
        form.append("overwrite", "true");
        form.append("type", "input");
        const response = await call("/upload/image", { method: "POST", body: form });
        if (!response.ok) throw new Error(`图片上传失败 HTTP ${response.status}`);
        const data = (await response.json()) as { name?: string; subfolder?: string };
        if (!data.name) throw new Error("图片上传失败:ComfyUI 未返回文件名");
        return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
    };

    const pushToCanvas = (images: string[]) => {
        if (!images.length) return;
        const originX = ctx.node.position.x + ctx.node.width + 60;
        ctx.applyOps(
            images.map((src, index) => ({
                type: "add_node" as const,
                nodeType: "image",
                title: `${ctx.node.title} ${index + 1}`,
                position: { x: originX + index * 344, y: ctx.node.position.y },
                width: 320,
                height: 320,
                metadata: { images: [{ id: `comfy-${Date.now()}-${index}`, status: "success", content: src, bytes: 0, mimeType: "image/png" }] },
            })),
        );
    };

    const run = async () => {
        if (busy) return;
        setError("");
        let graph: Record<string, unknown>;
        try {
            const info = parseWorkflow(workflow);
            graph = JSON.parse(workflow) as Record<string, unknown>;
            const target = promptNodeId || info.promptNodes[0]?.id || "";
            if (prompt.trim()) {
                if (!target) throw new Error("工作流里没有可写入提示词的节点,请手动选择");
                graph = applyPrompt(graph, target, prompt.trim());
            }
            if (useUpstreamImage) {
                const imageTarget = imageNodeId || info.imageNodes[0]?.id || "";
                if (!imageTarget) throw new Error("工作流里没有图片输入节点,请先在 ComfyUI 里加一个「加载图像」");
                setPhase("上传上游图片…");
                graph = applyImage(graph, imageTarget, await uploadUpstream());
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return;
        }

        cancelled.current = false;
        setBusy(true);
        setPhase("已提交,等待执行…");
        try {
            const response = await call("/prompt", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ prompt: graph, client_id: `vs-studio-${ctx.node.id}` }),
            });
            const text = await response.text();
            let payload: { prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, { errors?: { message?: string; details?: string }[] }> } = {};
            try {
                payload = text ? JSON.parse(text) : {};
            } catch {
                throw new Error(`ComfyUI 返回了非 JSON 内容(HTTP ${response.status})`);
            }
            if (!response.ok) throw new Error(payload.error?.message || `提交失败 HTTP ${response.status}`);
            const nodeError = Object.values(payload.node_errors || {})[0]?.errors?.[0];
            if (nodeError) throw new Error(nodeError.message || nodeError.details || "工作流参数不合法");
            const promptId = payload.prompt_id;
            if (!promptId) throw new Error("ComfyUI 没有返回任务号");

            const deadline = Date.now() + TIMEOUT_MS;
            for (;;) {
                if (cancelled.current) throw new Error("已取消");
                await sleep(POLL_MS);
                const historyResponse = await call(`/history/${encodeURIComponent(promptId)}`);
                if (!historyResponse.ok) continue;
                const history = (await historyResponse.json()) as Record<string, unknown>;
                const entry = history[promptId];
                if (!entry) {
                    if (Date.now() > deadline) throw new Error("等待超时(10 分钟),请到 ComfyUI 里看队列情况");
                    setPhase("执行中…");
                    continue;
                }
                const failure = historyError(entry);
                if (failure) throw new Error(failure);
                const found: ComfyImage[] = extractImages(entry);
                if (!found.length) {
                    if ((entry as { status?: { completed?: boolean } }).status?.completed) {
                        throw new Error("执行完成但没有图片输出,请确认工作流里有「保存图像」节点");
                    }
                    setPhase("执行中…");
                    continue;
                }
                setPhase("取回结果…");
                const sources: string[] = [];
                for (const image of found.slice(0, MAX_RESULTS)) {
                    const imageResponse = await call(viewUrl("", image));
                    if (!imageResponse.ok) continue;
                    sources.push(await blobToDataUrl(await imageResponse.blob()));
                }
                if (!sources.length) throw new Error("图片下载失败,请检查 ComfyUI 的 /view 是否可访问");
                set({ results: sources, status: "success", error: "" });
                if ((meta.autoSend as boolean | undefined) === true) pushToCanvas(sources);
                setPhase(`完成,${sources.length} 张`);
                return;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            set({ status: "error", error: message });
            setPhase("");
        } finally {
            setBusy(false);
        }
    };

    const btn = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, cursor: "pointer", fontSize: 12 } as const;
    const primary = { ...btn, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, cursor: busy ? "wait" : "pointer" } as const;
    const input = { width: "100%", padding: "6px 8px", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, boxSizing: "border-box", outline: "none" } as const;
    const label = { fontSize: 11, opacity: 0.7, flexShrink: 0 } as const;

    return (
        <div
            data-canvas-no-zoom
            onMouseDown={stop}
            onWheel={stop}
            style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}
        >
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>ComfyUI</span>
                <span style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{parsed ? `${parsed.nodes.length} 个节点` : "未载入工作流"}</span>
                <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} style={{ ...btn, padding: "2px 8px", fontSize: 11 }}>
                    {settingsOpen ? "收起设置" : "设置"}
                </button>
            </div>

            {settingsOpen ? (
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 10, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={label}>地址</span>
                        <input value={server} onChange={(e) => set({ server: e.target.value })} placeholder="http://127.0.0.1:8188" style={{ ...input, flex: 1 }} />
                        <button type="button" onClick={testConnection} style={{ ...btn, fontSize: 11, padding: "3px 8px" }}>测试</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ ...label, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            <input type="checkbox" checked={proxy} onChange={(e) => set({ proxy: e.target.checked })} />走本地代理(解决跨域)
                        </label>
                        <label style={{ ...label, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            <input type="checkbox" checked={(meta.autoSend as boolean | undefined) === true} onChange={(e) => set({ autoSend: e.target.checked })} />完成后自动铺到画布
                        </label>
                        {connection ? <span style={{ ...label, fontSize: 10.5, opacity: 0.75 }}>{connection}</span> : null}
                    </div>
                    <textarea
                        value={workflow}
                        onChange={(e) => set({ workflow: e.target.value })}
                        placeholder="在这里粘贴 ComfyUI 的「导出(API)」工作流 JSON"
                        onWheel={stop}
                        style={{ ...input, height: 92, resize: "none", fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.5 }}
                    />
                    {parsed ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={label}>提示词节点</span>
                                <select value={promptNodeId || parsed.promptNodes[0]?.id || ""} onChange={(e) => set({ promptNodeId: e.target.value })} style={{ ...input, flex: 1 }}>
                                    {parsed.promptNodes.length ? null : <option value="">(没有可写提示词的节点)</option>}
                                    {parsed.promptNodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}
                                </select>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={label}>图片输入</span>
                                <select value={imageNodeId || parsed.imageNodes[0]?.id || ""} onChange={(e) => set({ imageNodeId: e.target.value })} style={{ ...input, flex: 1 }}>
                                    {parsed.imageNodes.length ? null : <option value="">(工作流里没有加载图像节点)</option>}
                                    {parsed.imageNodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}
                                </select>
                            </div>
                        </div>
                    ) : workflow ? (
                        <span style={{ fontSize: 11, color: "#dc2626" }}>{(() => { try { parseWorkflow(workflow); return ""; } catch (err) { return err instanceof Error ? err.message : "工作流解析失败"; } })()}</span>
                    ) : null}
                </div>
            ) : null}

            <div style={{ flexShrink: 0 }}>
                {ctx.renderPromptInput({
                    value: prompt,
                    onChange: (value) => set({ prompt: value }),
                    placeholder: "提示词,会写进上面选的节点;也可以用 @ 引用上游文字节点",
                    style: { padding: 8, borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 12, lineHeight: 1.5, boxSizing: "border-box", minHeight: 56, maxHeight: 130 },
                })}
            </div>

            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={run} disabled={busy || !parsed} style={primary}>
                    {busy ? "运行中…" : "▶ 运行工作流"}
                </button>
                {busy ? (
                    <button type="button" onClick={() => { cancelled.current = true; setPhase("正在取消…"); }} style={btn}>停止</button>
                ) : null}
                {upstreamText && !prompt.trim() ? (
                    <button type="button" onClick={() => set({ prompt: upstreamText })} style={{ ...btn, fontSize: 11, padding: "3px 8px" }}>取上游文字</button>
                ) : null}
                {upstreamImage ? (
                    <label style={{ ...label, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input type="checkbox" checked={useUpstreamImage} onChange={(e) => set({ useUpstreamImage: e.target.checked })} />用上游图片
                    </label>
                ) : null}
                {results.length > 0 && !busy ? (
                    <button type="button" onClick={() => pushToCanvas(results)} style={{ ...btn, fontSize: 11, padding: "3px 8px" }}>铺到画布</button>
                ) : null}
            </div>

            {error ? <div style={{ flexShrink: 0, fontSize: 11, lineHeight: 1.5, color: "#dc2626", wordBreak: "break-word", maxHeight: 54, overflow: "auto" }}>{error}</div> : null}
            {phase && !error ? <div style={{ flexShrink: 0, fontSize: 11, opacity: 0.65 }}>{phase}</div> : null}

            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, overflow: "auto", alignContent: "start" }}>
                {results.map((src, index) => (
                    <img key={index} src={src} alt={`结果 ${index + 1}`} style={{ width: "100%", borderRadius: 8, border: `1px solid ${ctx.theme.node.stroke}`, display: "block" }} />
                ))}
                {!results.length ? (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11.5, lineHeight: 1.7, opacity: 0.55, padding: "8px 2px" }}>
                        ① 打开设置粘贴「导出(API)」工作流 ② 选提示词节点 ③ 输入提示词运行。
                        <br />
                        结果会显示在这里,也可以一键铺到画布。
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default definePlugin({
    id: "comfyui-workflow",
    name: "ComfyUI 工作流",
    version: "1.0.0",
    description: "把本机 ComfyUI 的 API 工作流接进画布:选提示词节点、运行、结果直接落到画布,支持上游图片作输入",
    nodes: [
        {
            type: "comfyui-workflow:run",
            title: "ComfyUI 工作流",
            icon: "🛠",
            description: "运行 ComfyUI 的 API 格式工作流,提示词与输入图都能接画布",
            defaultSize: { width: 520, height: 620 },
            defaultMetadata: { server: "http://127.0.0.1:8188", proxy: true, workflow: "", promptNodeId: "", imageNodeId: "", prompt: "", useUpstreamImage: false, autoSend: false, results: [] },
            minimapColor: "#0ea5e9",
            hidePanel: true,
            interactionToggle: true,
            resource: (node) => {
                const images = node.metadata?.results as string[] | undefined;
                return images && images.length ? { kind: "image", url: images[0] } : null;
            },
            Content: ComfyWorkflowContent,
            toolbar: (ctx) => {
                const images = (ctx.node.metadata?.results as string[] | undefined) || [];
                if (!images.length) return [];
                return [
                    {
                        id: "comfy-to-canvas",
                        title: "把结果铺到画布",
                        label: "铺到画布",
                        icon: "🖼",
                        onClick: () => {
                            const originX = ctx.node.position.x + ctx.node.width + 60;
                            ctx.applyOps(
                                images.map((src, index) => ({
                                    type: "add_node" as const,
                                    nodeType: "image",
                                    title: `${ctx.node.title} ${index + 1}`,
                                    position: { x: originX + index * 344, y: ctx.node.position.y },
                                    width: 320,
                                    height: 320,
                                    metadata: { images: [{ id: `comfy-${Date.now()}-${index}`, status: "success", content: src, bytes: 0, mimeType: "image/png" }] },
                                })),
                            );
                        },
                    },
                ];
            },
        },
    ],
});
