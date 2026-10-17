import axios, { type AxiosResponse } from "axios";

import i18n from "@/i18n";
import { buildApiUrl, resolveModelRequestConfig, resolveModelScript, withLocalProxy, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import { normalizePluginImages, runModelPlugin } from "./model-plugin";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { buildImageReferencePromptText, type SubjectReferenceHint } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import { imageSizePresets, inferMediaScale } from "@/lib/media-size";
import { buildMidjourneyRequest, isUnsupportedMidjourneySize } from "@/lib/midjourney-request";
import { createMediaJob, waitMediaJob } from "./media-jobs";
import { registerMediaJobTask } from "./media-job-runtime";
import type { ReferenceImage } from "@/types/image";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

type ResponseInputMessage =
    | AiTextMessage
    | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string }
    | { role: "tool"; tool_call_id: string; content: string };

type ResponseFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
};

type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
};

type ToolChoice = "auto" | "required" | { type: "function"; name: string };
type ResponseMessageContent = AiTextMessage["content"] | string;
type ResponseInputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type ResponseInputItem =
    | { role: "system" | "user" | "assistant"; content: string | ResponseInputContent[] }
    | { type: "function_call"; call_id: string; name: string; arguments: string }
    | { type: "function_call_output"; call_id: string; output: string };
type ResponseApiToolDefinition = {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
};
type ResponseApiOutputItem =
    | { type?: "message"; content?: Array<{ type?: string; text?: string }> }
    | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponseApiPayload = {
    id?: string;
    output?: ResponseApiOutputItem[];
    output_text?: string;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ResponseStreamState = { buffer: string; text: string; payload?: ResponseApiPayload; error?: string };

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type GeminiPart = {
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
    functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
    functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
    thoughtSignature?: string;
    thought_signature?: string;
};
type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };
type GeminiPayload = {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    models?: Array<{ name?: string }>;
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
};
type GeminiStreamState = { buffer: string; text: string; toolCalls: ResponseToolCall[]; error?: string };
type RequestOptions = {
    signal?: AbortSignal;
    subjects?: SubjectReferenceHint[];
    onTaskCreated?: (taskId: string) => void;
    /**
     * 交给本地 Agent 执行时的回调。
     * started=false 表示这次没走 Agent（Agent 没启动或不支持），界面不该显示这张图正在跑。
     */
    onAgentJob?: (started: boolean) => void;
    /** 结果要写回哪个画布/节点/槽位；不传就不做刷新重连。 */
    jobTarget?: { projectId: string; nodeId: string; imageId?: string };
};

const IMAGE_QUALITY_VALUES = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";
// 与 image-storage 的下载超时保持一致，避免接口挂起时节点一直停在生成中。
const IMAGE_REQUEST_TIMEOUT_MS = 10 * 60_000;

const GEMINI_SUPPORTED_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    return IMAGE_QUALITY_VALUES.includes(value) ? value : undefined;
}

/** Only "transparent" is forwarded; any other value (incl. empty) means keep the default opaque background. */
function normalizeBackground(background: string | undefined) {
    return background?.trim().toLowerCase() === "transparent" ? "transparent" : undefined;
}

/** Map a bare ratio such as "1:1" to an explicit pixel dimension like "1024x1024". */
function resolveSize(ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const preset = imageSizePresets["1k"][ratio];
    if (preset) return preset;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    const shortSide = DEFAULT_IMAGE_SHORT_SIDE;
    const longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error(apiText("invalidImageSizeFormat"));
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error(apiText("positiveImageRatio"));
    return { width: w, height: h };
}

function parseImageRatio(value: string) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    return ratio;
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(apiText("positiveImageDimensions"));
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error(apiText("imageDimensionStep"));
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error(apiText("imageEdgeLimit"));
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error(apiText("imagePixelLimit"));
}

function resolveRequestSize(size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(value);
    throw new Error(apiText("invalidImageSizeFormat"));
}

function resolveGeminiImageConfig(config: AiConfig) {
    const value = config.size.trim();
    const dimensions = parseImageDimensions(value);
    const ratio = dimensions ? `${dimensions.width}:${dimensions.height}` : value;
    const aspectRatio = value && value.toLowerCase() !== "auto" ? closestGeminiAspectRatio(ratio) : undefined;
    const imageSize = resolveGeminiImageSize(dimensions);
    const image = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
    return Object.keys(image).length ? { imageConfig: image } : {};
}

function closestGeminiAspectRatio(value: string) {
    const ratio = parseImageRatio(value);
    const target = ratio.width / ratio.height;
    return GEMINI_SUPPORTED_RATIOS.reduce((best, item) => {
        const current = parseRatioValue(item);
        const bestRatio = parseRatioValue(best);
        return Math.abs(current.width / current.height - target) < Math.abs(bestRatio.width / bestRatio.height - target) ? item : best;
    });
}

/** Gemini takes the resolution tier and the ratio separately; the tier comes from the size presets. */
function resolveGeminiImageSize(dimensions: { width: number; height: number } | null) {
    if (!dimensions) return undefined;
    const size = `${dimensions.width}x${dimensions.height}`;
    const scale = Object.keys(imageSizePresets).find((key) => Object.values(imageSizePresets[key]).includes(size));
    if (scale) return scale.toUpperCase();
    const edge = Math.max(dimensions.width, dimensions.height);
    if (edge <= 768) return "512";
    if (edge <= 1536) return "1K";
    if (edge <= 3072) return "2K";
    return "4K";
}

/** 图片地址字段：这些键下的字符串即使没有图片扩展名也按图片处理（中转的 CDN 地址常常没有后缀）。 */
const IMAGE_URL_KEYS = ["url", "image_url", "imageUrl", "image", "images", "imageUrls", "image_urls", "dataUrl", "fileUrl", "output_url", "resultUrl"];
/** base64 字段：中转返回裸 base64 时补上 data URL 前缀。 */
const IMAGE_BASE64_KEYS = ["b64_json", "base64", "imageBase64", "image_base64"];
const IMAGE_TASK_POLL_INTERVAL_MS = 3000;
const IMAGE_TASK_TIMEOUT_MS = 10 * 60_000;
/**
 * 部分中转（例如 xinfeng.best）支持用这个标准 Preference 头把生图改成异步任务：
 * 立刻返回 202 + 任务 id，之后再查任务取结果。Midjourney 这类要几分钟才出图的模型
 * 靠它绕开中转网关的读超时（实测约 75 秒就会把同步连接掐断）。
 * 不支持该头的中转会按 RFC 7240 直接忽略，仍走原来的同步返回，因此可以无条件带上。
 */
const IMAGE_ASYNC_PREFERENCE = "respond-async";

export function isOpenAIMidjourneyConfig(config: AiConfig) {
    return config.apiFormat === "openai" && /(?:^|[/_\-\s])(?:mj|niji)(?:$|[/_\-\s])|midjourney/i.test(config.model.trim());
}


function looksLikeImageSource(value: string) {
    return /^data:image\//i.test(value) || /^blob:/i.test(value) || /^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif|bmp)(\?\S*)?$/i.test(value);
}

/**
 * 从中转返回里尽量挖出图片。各家字段名差异很大（data / images / results / output / artifacts /
 * imageUrl / imageUrls…），这里按「键名 + 值形状」宽松收集，避免因为字段名不认识就丢掉已经生成好的图。
 */
function collectImageSources(value: unknown, sources: string[], depth = 0, permissive = false) {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectImageSources(item, sources, depth + 1, permissive));
        return;
    }
    if (typeof value === "string") {
        if (looksLikeImageSource(value) || (permissive && /^(https?:\/\/|data:image\/|blob:)/i.test(value))) sources.push(value);
        return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const imageCountBeforeMultiFields = sources.length;
    for (const key of ["imageUrls", "image_urls"]) {
        let candidate = record[key];
        if (typeof candidate === "string") {
            try {
                candidate = JSON.parse(candidate);
            } catch {
                continue;
            }
        }
        if (Array.isArray(candidate)) collectImageSources(candidate, sources, depth + 1, true);
    }
    const hasPreferredImageList = sources.length > imageCountBeforeMultiFields;
    for (const [key, item] of Object.entries(record)) {
        if (hasPreferredImageList && ["imageUrls", "image_urls", "imageUrl", "image_url"].includes(key)) continue;
        const isImageKey = IMAGE_URL_KEYS.includes(key);
        if (typeof item === "string") {
            if (IMAGE_BASE64_KEYS.includes(key) && item.length > 64) sources.push(`data:image/png;base64,${item}`);
            else if (isImageKey && /^(https?:\/\/|data:image\/|blob:)/i.test(item)) sources.push(item);
            else if (isImageKey) {
                // MJ 中转有时把四张图的数组再 JSON.stringify 成一个字符串，而不是直接返回数组。
                try {
                    collectImageSources(JSON.parse(item), sources, depth + 1, true);
                } catch {
                    // 普通文本或未解析的字段不是图片结果。
                }
            } else if (looksLikeImageSource(item)) sources.push(item);
            continue;
        }
        collectImageSources(item, sources, depth + 1, isImageKey || permissive);
    }
}

function toGeneratedImages(sources: string[]) {
    return [...new Set(sources)].map((dataUrl) => ({ id: nanoid(), dataUrl }));
}

/** Midjourney 类中转只返回任务 ID，需要再查任务状态才能拿到图片。 */
function readImageTaskId(payload: Record<string, unknown>) {
    const direct = stringValue(payload.taskId) || stringValue(payload.task_id);
    if (direct) return direct;
    const result = payload.result;
    if (typeof result === "string") return looksLikeImageSource(result) ? "" : result;
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        return stringValue(record.taskId) || stringValue(record.task_id) || stringValue(record.id);
    }
    return "";
}

function imageTaskStatus(payload: Record<string, unknown>) {
    return (stringValue(payload.status) || stringValue(payload.state)).toUpperCase();
}

function imagePayloadError(payload: ImageApiResponse) {
    const record = payload as Record<string, unknown>;
    const upstream = readApiErrorMessage(payload) || stringValue(record.description);
    if (upstream) return upstream;
    const rawKeys = Object.keys(record).filter((key) => key !== "code" && key !== "msg" && key !== "error");
    return rawKeys.length > 0 ? apiText("unknownImageResponse", { fields: rawKeys.join(", ") }) : apiText("noImageReturned");
}

/** 中转把 MJ 任务接口挂的位置不统一：有的在 /v1 下，有的直接挂在根路径，两个都试。 */
function imageTaskUrls(config: AiConfig, taskId: string) {
    const id = encodeURIComponent(taskId);
    const root = config.baseUrl.trim().replace(/\/+$/, "");
    return [aiApiUrl(config, `/mj/task/${id}/fetch`), withLocalProxy(`${root}/mj/task/${id}/fetch`)];
}

async function pollImageTask(config: AiConfig, taskId: string, options?: RequestOptions) {
    const urls = imageTaskUrls(config, taskId);
    const deadline = Date.now() + IMAGE_TASK_TIMEOUT_MS;
    let activeIndex = 0;
    for (;;) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        let payload: Record<string, unknown> = {};
        let lastError: unknown = null;
        for (let index = activeIndex; index < urls.length; index += 1) {
            try {
                const response = await axios.get<Record<string, unknown>>(urls[index], { headers: aiHeaders(config), signal: options?.signal, timeout: 60_000 });
                activeIndex = index;
                payload = response.data || {};
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
            }
        }
        if (lastError) throw lastError;
        const sources: string[] = [];
        collectImageSources(payload, sources);
        if (sources.length) return toGeneratedImages(sources);
        const status = imageTaskStatus(payload);
        if (status === "FAILURE" || status === "FAILED" || status === "CANCEL") {
            throw new Error(stringValue(payload.failReason) || stringValue(payload.description) || apiText("requestFailed"));
        }
        if (Date.now() >= deadline) throw new Error(apiText("imageTimeout"));
        await new Promise((resolve) => window.setTimeout(resolve, IMAGE_TASK_POLL_INTERVAL_MS));
    }
}

/** 请求带了 Prefer: respond-async 时，中转回 202 表示「已建任务」，任务 id 在响应体里，退一步再读 Location 头。 */
function readAsyncTaskId(response: AxiosResponse) {
    if (response.status !== 202) return "";
    const payload = (response.data || {}) as Record<string, unknown>;
    const direct = stringValue(payload.id) || stringValue(payload.taskId) || stringValue(payload.task_id);
    if (direct) return direct;
    const location = response.headers?.location;
    if (typeof location !== "string") return "";
    // Location 可能是完整地址，任务 id 是最后一段。
    return decodeURIComponent(location.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "");
}

/**
 * 异步图片任务：先查状态，完成后取结果。
 * 路径取自中转文档：GET /v1/images/tasks/{id} 查状态，GET /v1/images/tasks/{id}/result 取结果。
 */
async function pollAsyncImageTask(config: AiConfig, taskId: string, options?: RequestOptions) {
    const id = encodeURIComponent(taskId);
    const statusUrl = aiApiUrl(config, `/images/tasks/${id}`);
    const resultUrl = aiApiUrl(config, `/images/tasks/${id}/result`);
    const deadline = Date.now() + IMAGE_TASK_TIMEOUT_MS;
    for (;;) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const payload = await readAsyncTaskPayload(config, statusUrl, options);
        const status = imageTaskStatus(payload);
        if (isImageTaskFailure(status)) throw new Error(imageTaskFailureReason(payload));
        if (isImageTaskSuccess(status)) {
            // 文档里结果单独放在 /result，少数实现会直接塞进状态响应，取不到再回退。
            const result = await readAsyncTaskPayload(config, resultUrl, options).catch(() => ({}) as Record<string, unknown>);
            const sources: string[] = [];
            collectImageSources(result, sources);
            if (!sources.length) collectImageSources(payload, sources);
            if (sources.length) return toGeneratedImages(sources);
            throw new Error(imagePayloadError(payload as ImageApiResponse));
        }
        // 没有状态字段却已经给了图，按完成处理。
        if (!status) {
            const sources: string[] = [];
            collectImageSources(payload, sources);
            if (sources.length) return toGeneratedImages(sources);
        }
        if (Date.now() >= deadline) throw new Error(apiText("imageTimeout"));
        await new Promise((resolve) => window.setTimeout(resolve, IMAGE_TASK_POLL_INTERVAL_MS));
    }
}

/** 读异步任务接口；中转回了 202 却没有任务接口时给出明确提示。 */
async function readAsyncTaskPayload(config: AiConfig, url: string, options?: RequestOptions) {
    try {
        return (await axios.get<Record<string, unknown>>(url, { headers: aiHeaders(config), signal: options?.signal, timeout: 60_000 })).data || {};
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) throw new Error(apiText("imageTaskUnsupported"));
        throw error;
    }
}

/**
 * 刷新页面后继续查一个已创建的异步生图任务。
 * 请求发出时任务号已存进节点 metadata（imageTaskId），这里用它恢复轮询；
 * 模型按节点上记录的来，和发起请求时保持一致。
 */
export async function resumeImageTask(config: AiConfig, taskId: string, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.imageModel);
    return pollAsyncImageTask(requestConfig, taskId, options);
}

function isImageTaskFailure(status: string) {
    return status === "FAILURE" || status === "FAILED" || status === "CANCEL" || status === "CANCELLED";
}

function isImageTaskSuccess(status: string) {
    return status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED" || status === "DONE";
}

function imageTaskFailureReason(payload: Record<string, unknown>) {
    return readApiErrorMessage(payload) || stringValue(payload.failReason) || stringValue(payload.fail_reason) || stringValue(payload.description) || apiText("requestFailed");
}

/**
 * 解析生图返回：先找图片，找不到再看是不是异步任务（轮询任务接口），
 * 都没有才报错，并且优先把上游自己的说明当作错误信息，方便定位。
 */
async function parseImagePayload(config: AiConfig, payload: ImageApiResponse, options?: RequestOptions) {
    const sources: string[] = [];
    collectImageSources(payload, sources);
    if (sources.length) return toGeneratedImages(sources);
    const taskId = readImageTaskId(payload as Record<string, unknown>);
    if (taskId) return pollImageTask(config, taskId, options);
    throw new Error(imagePayloadError(payload));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        // The value may be serialized JSON, such as error.message, or a plain-text error.
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            // Treat an empty parsed object such as "{}" as having no useful message.
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            // 中转/网关故障时经常返回整页 HTML（nginx、Cloudflare 的 502/503/504 页面），
            // 这种页面本身没人看得懂，先尝试把状态码读出来换成正常提示。
            const gatewayMsg = readHtmlGatewayError(value);
            if (gatewayMsg) return gatewayMsg;
            // Detect HTML error pages.
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            // 本地代理在上游连接失败时会把 Node 的原始报错原样透传过来，这里换成可读提示。
            if (/^fetch failed$/i.test(value.trim())) return apiText("proxyUpstreamFailed");
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

/**
 * 网关故障页（nginx / Cloudflare）的 <title> 或 <h1> 里通常写着状态码，例如
 * "<title>502 Bad Gateway</title>"。只认 5xx，避免把 Cloudflare 的 403 拦截页误报成鉴权失败。
 */
function readHtmlGatewayError(value: unknown) {
    if (typeof value !== "string") return "";
    const matched = value.match(/(?:<title>|<h1>)\s*(5\d{2})\b/i);
    return matched ? readStatusError(Number(matched[1]), "") : "";
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return apiText("imageTimeout");
        // 上游连一个响应都没给就断开（网关读超时、进程被杀）。这和普通网络错误不同：
        // 请求很可能已经在对方那边执行完了，只是结果传不回来，所以单独提示。
        if (
            !error.response &&
            (error.code === "ERR_EMPTY_RESPONSE" ||
                error.code === "ECONNRESET" ||
                /socket hang up|empty response/i.test(error.message || ""))
        ) {
            return apiText("upstreamClosed");
        }
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        // Prefer the API error from the response body.
        const apiMsg = readApiErrorMessage(responseData);
        if (apiMsg) return apiMsg;
        // Infer the error from the HTTP status when the response body has no usable message.
        const statusMsg = readStatusError(error.response?.status, fallback);
        if (statusMsg) return statusMsg;
        // Fall back to Axios's own error message.
        return error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

/**
 * 很多模型/中转会忽略 size 参数，尤其带参考图的编辑请求会直接沿用参考图的比例。
 * 这里把用户选的画幅再写进系统提示词，让「选的尺寸」真正生效；size 为 auto 时不加任何约束。
 */
function withImageSizeInstruction(config: AiConfig) {
    const directive = imageSizeDirective(config.size);
    if (!directive) return config;
    return { ...config, systemPrompt: [config.systemPrompt.trim(), directive].filter(Boolean).join("\n\n") };
}

function imageSizeDirective(size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return "";
    const dimensions = parseImageDimensions(value) || (value.includes(":") ? parseRatioValue(value) : null);
    if (!dimensions) return "";
    const ratio = dimensions.width / dimensions.height;
    const orientation = Math.abs(ratio - 1) <= 0.05 ? "方形构图" : ratio > 1 ? "横向构图，宽大于高" : "竖向构图，高大于宽";
    return `输出画幅固定为 ${simplifiedRatio(dimensions.width, dimensions.height)}（${orientation}），不要改变画面比例。`;
}

function simplifiedRatio(width: number, height: number) {
    const divisor = greatestCommonDivisor(width, height) || 1;
    return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
    return b ? greatestCommonDivisor(b, a % b) : a;
}

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

/**
 * 把一次生图请求交给本地 Agent 执行。
 * 返回任务号表示这次已经在服务端跑起来了，并且已登记到本地，刷新页面后能重连；
 * 返回空表示 Agent 不可用，由调用方回退成浏览器直连。
 */
async function submitAgentImageJob(
    config: AiConfig,
    kind: "image" | "imageEdit",
    path: string,
    body: unknown,
    title: string,
    options?: RequestOptions,
) {
    let jobId = "";
    try {
        const job = await createMediaJob({ kind, baseUrl: config.baseUrl, apiKey: config.apiKey, path, model: config.model, body, title, timeoutMs: IMAGE_REQUEST_TIMEOUT_MS });
        jobId = job?.id || "";
    } catch {
        jobId = "";
    }
    options?.onAgentJob?.(Boolean(jobId));
    if (!jobId) return "";
    // 登记任务号：刷新页面后靠它重连，重连只查询、不重发，不会重复扣费。
    const target = options?.jobTarget;
    if (target) registerMediaJobTask({ jobId, projectId: target.projectId, nodeId: target.nodeId, imageId: target.imageId, kind: "image" });
    return jobId;
}

/** 表单请求转成 JSON：文件字段按 data URL 传，和上游编辑接口收到的内容等价。 */
async function formDataToJson(formData: FormData) {
    const body: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
            body[key] = value;
            continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("参考图读取失败"));
            reader.readAsDataURL(value);
        });
        // image[] 这类多图字段要按数组传，否则服务端只能收到最后一张。
        const existing = body[key];
        if (key.endsWith("[]")) body[key] = Array.isArray(existing) ? [...existing, dataUrl] : [dataUrl];
        else body[key] = dataUrl;
    }
    return body;
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function geminiBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiModelName(model: string) {
    return model.trim().replace(/^models\//, "");
}

function geminiApiUrl(config: Pick<AiConfig, "baseUrl" | "model">, action?: "generateContent" | "streamGenerateContent") {
    const baseUrl = geminiBaseUrl(config);
    if (!action) return withLocalProxy(`${baseUrl}/models`);
    return withLocalProxy(`${baseUrl}/models/${encodeURIComponent(geminiModelName(config.model))}:${action}`);
}

function geminiHeaders(config: Pick<AiConfig, "apiKey">) {
    return {
        "x-goog-api-key": config.apiKey,
        "Content-Type": "application/json",
    };
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: ResponseInputMessage[]): ResponseInputItem[] {
    return messages.flatMap((message): ResponseInputItem[] => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseContent(content: ResponseMessageContent): string | ResponseInputContent[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text" as const, text: item.text } : { type: "input_image" as const, image_url: item.image_url.url }));
}

function toResponseTool(tool: ResponseFunctionTool): ResponseApiToolDefinition {
    return {
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
    };
}

function parseToolResponse(payload: ResponseApiPayload): ToolResponseResult {
    const output = payload.output || [];
    const content =
        payload.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseApiOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({
            id: item.call_id || item.id || "",
            type: "function" as const,
            function: { name: item.name || "", arguments: item.arguments || "{}" },
        }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function validateResponsePayload(payload: ResponseApiPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || apiText("requestFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

function validateGeminiPayload(payload: GeminiPayload) {
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) throw new Error(apiText("geminiRejected", { reason: payload.promptFeedback.blockReason }));
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return readStatusError(response.status, fallback);
    try {
        return responseErrorMessage(JSON.parse(text)) || readStatusError(response.status, fallback);
    } catch {
        // 非 JSON 响应：网关 HTML 故障页先换算成状态码提示，其余情况截断后原样给出。
        return readHtmlGatewayError(text) || text.slice(0, 300) || readStatusError(response.status, fallback);
    }
}

function consumeResponseStreamBlock(block: string, state: ResponseStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    const type = stringValue(event.type);
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (type === "response.completed" && isRecord(event.response)) {
        state.payload = event.response as ResponseApiPayload;
    } else if (Array.isArray(event.output)) {
        state.payload = event as ResponseApiPayload;
    }
}

function consumeResponseStreamText(state: ResponseStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeResponseStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeResponseStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

async function requestStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(aiApiUrl(config, "/responses"), {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), Accept: "text/event-stream" },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options?.signal,
    });
    if (!response.ok) throw new Error(await readFetchError(response, apiText("requestFailed")));
    if (!response.body) {
        const payload = (await response.json()) as ResponseApiPayload;
        validateResponsePayload(payload);
        return parseToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ResponseStreamState = { buffer: "", text: "" };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeResponseStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeResponseStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    if (!state.payload) return { content: state.text, toolCalls: [] };
    validateResponsePayload(state.payload);
    const result = parseToolResponse(state.payload);
    return { ...result, content: state.text || result.content };
}

function toGeminiBody(config: AiConfig, messages: ResponseInputMessage[], extra?: Record<string, unknown>) {
    const systemText = [
        config.systemPrompt.trim(),
        ...messages.flatMap((message) => (!("type" in message) && message.role === "system" ? [geminiTextContent(message.content)] : [])),
    ]
        .filter(Boolean)
        .join("\n\n");
    const contents = toGeminiContents(messages.filter((message) => ("type" in message ? true : message.role !== "system")));
    return {
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        ...extra,
    };
}

function toGeminiContents(messages: ResponseInputMessage[]): GeminiContent[] {
    const callNameById = new Map<string, string>();
    return messages.flatMap((message): GeminiContent[] => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args: jsonObject(message.arguments) }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") {
            const name = callNameById.get(message.tool_call_id) || "tool_result";
            return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name, response: { result: jsonValue(message.content) } } }] }];
        }
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
}

function toGeminiParts(content: ResponseMessageContent): GeminiPart[] {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => (item.type === "text" ? { text: item.text } : toGeminiImagePart(item.image_url.url)));
}

function toGeminiImagePart(url: string): GeminiPart {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: url, mimeType: "image/png" } };
}

function geminiTextContent(content: ResponseMessageContent) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? item.text : item.image_url.url)).join("\n");
}

function jsonObject(value: string): Record<string, unknown> {
    const parsed = jsonValue(value);
    return isRecord(parsed) ? parsed : {};
}

function jsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toGeminiToolOptions(tools: ResponseFunctionTool[], toolChoice: ToolChoice) {
    if (!tools.length) return {};
    const functionDeclarations = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
    const functionCallingConfig =
        typeof toolChoice === "object"
            ? { mode: "ANY", allowedFunctionNames: [toolChoice.name] }
            : { mode: toolChoice === "required" ? "ANY" : "AUTO" };
    return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig },
    };
}

async function requestGeminiStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(`${geminiApiUrl(config, "streamGenerateContent")}?alt=sse`, {
        method: "POST",
        headers: geminiHeaders(config),
        body: JSON.stringify(body),
        signal: options?.signal,
    });
    if (!response.ok) throw new Error(await readFetchError(response, apiText("requestFailed")));
    if (!response.body) {
        const payload = (await response.json()) as GeminiPayload;
        return parseGeminiToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: GeminiStreamState = { buffer: "", text: "", toolCalls: [] };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeGeminiStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeGeminiStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    return { content: state.text, toolCalls: state.toolCalls };
}

function consumeGeminiStreamText(state: GeminiStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeGeminiStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeGeminiStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function consumeGeminiStreamBlock(block: string, state: GeminiStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const result = parseGeminiToolResponse(JSON.parse(data) as GeminiPayload);
    if (result.content) {
        state.text += result.content;
        onDelta?.(state.text);
    }
    state.toolCalls.push(...result.toolCalls);
}

function parseGeminiToolResponse(payload: GeminiPayload): ToolResponseResult {
    validateGeminiPayload(payload);
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const content = parts.map((part) => part.text || "").join("");
    const toolCalls = parts
        .map((part) => part.functionCall)
        .filter((call): call is NonNullable<GeminiPart["functionCall"]> => Boolean(call?.name))
        .map((call) => {
            const part = parts.find((item) => item.functionCall === call);
            const thoughtSignature = part?.thoughtSignature || part?.thought_signature;
            return {
                id: call.id || nanoid(),
                type: "function" as const,
                function: { name: call.name || "", arguments: JSON.stringify(call.args || {}) },
                ...(thoughtSignature ? { thoughtSignature } : {}),
            };
        });
    return { content, toolCalls };
}

async function requestGeminiImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions) {
    const requests = Array.from({ length: count }, () => requestGeminiImagesOnce(config, prompt, references, options));
    return (await Promise.all(requests)).flat();
}

async function requestGeminiImagesOnce(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const image of references) {
        parts.push(toGeminiImagePart(await imageToDataUrl(image)));
    }
    const response = await axios.post<GeminiPayload>(
        geminiApiUrl(config, "generateContent"),
        {
            ...toGeminiBody(config, [{ role: "user", content: prompt }], { generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...resolveGeminiImageConfig(config) } }),
            contents: [{ role: "user", parts }],
        },
        { headers: geminiHeaders(config), signal: options?.signal, timeout: IMAGE_REQUEST_TIMEOUT_MS },
    );
    return parseGeminiImagePayload(response.data);
}

function parseGeminiImagePayload(payload: GeminiPayload) {
    validateGeminiPayload(payload);
    const images =
        payload.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part) => {
                const inlineData = part.inlineData || (part.inline_data ? { mimeType: part.inline_data.mimeType || part.inline_data.mime_type, data: part.inline_data.data } : undefined);
                if (inlineData?.data) return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
                return part.fileData?.fileUri || null;
            })
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];
    if (!images.length) throw new Error(apiText("geminiNoImage"));
    return images;
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const requestConfig = withImageSizeInstruction(resolveModelRequestConfig(config, config.model || config.imageModel));
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(config.size);
        const background = normalizeBackground(config.background);
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, prompt),
                images: [],
                params: { size: requestSize, resolution: inferMediaScale(config.size), quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            return normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("requestFailed")));
        }
    }
    if (requestConfig.apiFormat === "gemini") {
        try {
            return await requestGeminiImages(requestConfig, prompt, [], n, options);
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("requestFailed")));
        }
    }
    const quality = normalizeQuality(config.quality);
    const isMidjourney = isOpenAIMidjourneyConfig(requestConfig);
    if (isMidjourney && isUnsupportedMidjourneySize(requestConfig.size)) throw new Error(apiText("midjourney4kUnsupported"));
    const midjourneyRequest = isMidjourney ? buildMidjourneyRequest(requestConfig.size, config.quality, n, prompt) : undefined;
    const requestSize = isMidjourney ? undefined : resolveRequestSize(config.size);
    const background = normalizeBackground(config.background);
    const body = isMidjourney
        ? {
              model: requestConfig.model,
              prompt: withSystemPrompt(requestConfig, midjourneyRequest?.prompt ?? prompt),
              ...(midjourneyRequest?.params || {}),
          }
        : {
              model: requestConfig.model,
              prompt: withSystemPrompt(requestConfig, prompt),
              n,
              ...(quality ? { quality } : {}),
              ...(requestSize ? { size: requestSize } : {}),
              ...(background ? { background } : {}),
              // gpt-image models reject response_format; they always return b64.
              ...(/gpt-image/.test(requestConfig.model) ? {} : { response_format: "b64_json" }),
              output_format: IMAGE_OUTPUT_FORMAT,
          };
    // 交给本地常驻服务去调上游：页面刷新/关标签都不会掐断这次请求（浏览器直连会被掐断）。
    const jobId = await submitAgentImageJob(requestConfig, "image", "/images/generations", body, `生成图片 · ${requestConfig.model}`, options);
    if (jobId) return (await waitMediaJob(jobId, { signal: options?.signal })).map((dataUrl) => ({ id: nanoid(), dataUrl }));
    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(requestConfig, "/images/generations"), body, {
            headers: { ...aiHeaders(requestConfig, "application/json"), Prefer: IMAGE_ASYNC_PREFERENCE },
            signal: options?.signal,
            timeout: IMAGE_REQUEST_TIMEOUT_MS,
        });
        const asyncTaskId = readAsyncTaskId(response);
        if (asyncTaskId) {
            // 任务号先交给调用方存进节点，页面刷新后才能继续查这个任务。
            options?.onTaskCreated?.(asyncTaskId);
            return pollAsyncImageTask(requestConfig, asyncTaskId, options);
        }
        const images = await parseImagePayload(requestConfig, response.data, options);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("requestFailed")));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    const requestConfig = withImageSizeInstruction(resolveModelRequestConfig(config, config.model || config.imageModel));
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references, options?.subjects);
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(config.size);
        const background = normalizeBackground(config.background);
        const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, requestPrompt),
                images: refs,
                params: { size: requestSize, resolution: inferMediaScale(config.size), quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            return normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("requestFailed")));
        }
    }
    if (requestConfig.apiFormat === "gemini") {
        try {
            return await requestGeminiImages(requestConfig, requestPrompt, references, n, options);
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("requestFailed")));
        }
    }

    const quality = normalizeQuality(config.quality);
    const isMidjourney = isOpenAIMidjourneyConfig(requestConfig);
    if (isMidjourney && isUnsupportedMidjourneySize(requestConfig.size)) throw new Error(apiText("midjourney4kUnsupported"));
    const midjourneyRequest = isMidjourney ? buildMidjourneyRequest(requestConfig.size, config.quality, n, requestPrompt) : undefined;
    const requestSize = isMidjourney ? undefined : resolveRequestSize(config.size);
    const background = normalizeBackground(config.background);
    const formData = new FormData();
    formData.set("model", requestConfig.model);
    formData.set("prompt", withSystemPrompt(requestConfig, midjourneyRequest?.prompt ?? requestPrompt));
    if (isMidjourney) {
        for (const [key, value] of Object.entries(midjourneyRequest?.params || {})) {
            if (value === true) formData.set(key, "true");
            else if (value !== false) formData.set(key, String(value));
        }
    } else {
        formData.set("n", String(n));
        // gpt-image models reject response_format; they always return b64.
        if (!/gpt-image/.test(requestConfig.model)) {
            formData.set("response_format", "b64_json");
        }
        formData.set("output_format", IMAGE_OUTPUT_FORMAT);
        if (quality) {
            formData.set("quality", quality);
        }
        if (requestSize) {
            formData.set("size", requestSize);
        }
        if (background) {
            formData.set("background", background);
        }
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    const imageField = files.length > 1 ? "image[]" : "image";
    files.forEach((file) => formData.append(imageField, file));

    // 带参考图的编辑请求同样交给本地 Agent：参考图转成 data URL 一起送过去。
    const editBody = await formDataToJson(formData);
    const jobId = await submitAgentImageJob(requestConfig, "imageEdit", "/images/edits", editBody, `编辑图片 · ${requestConfig.model}`, options);
    if (jobId) return (await waitMediaJob(jobId, { signal: options?.signal })).map((dataUrl) => ({ id: nanoid(), dataUrl }));

    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(requestConfig, "/images/edits"), formData, {
            headers: { ...aiHeaders(requestConfig), Prefer: IMAGE_ASYNC_PREFERENCE },
            signal: options?.signal,
            timeout: IMAGE_REQUEST_TIMEOUT_MS,
        });
        const asyncTaskId = readAsyncTaskId(response);
        if (asyncTaskId) {
            // 任务号先交给调用方存进节点，页面刷新后才能继续查这个任务。
            options?.onTaskCreated?.(asyncTaskId);
            return pollAsyncImageTask(requestConfig, asyncTaskId, options);
        }
        const images = await parseImagePayload(requestConfig, response.data, options);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("requestFailed")));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const script = resolveModelScript(config, config.model || config.textModel);
    if (script) {
        try {
            const answer = await runModelPlugin<string>({
                capability: "text",
                script,
                config: requestConfig,
                messages: withSystemMessage(requestConfig, messages),
                signal: options?.signal,
                onDelta,
            });
            const text = String(answer ?? "").trim() || apiText("noContent");
            if (text === apiText("noContent")) onDelta(text);
            return text;
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("requestFailed")));
        }
    }
    try {
        if (requestConfig.apiFormat === "gemini") {
            const answer = (await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages), onDelta, options)).content || apiText("noContent");
            if (answer === apiText("noContent")) onDelta(answer);
            return answer;
        }
        const answer = (await requestStreamingResponse(requestConfig, {
            model: requestConfig.model,
            input: toResponseInput(withSystemMessage(requestConfig, messages)),
            ...(requestConfig.reasoningEffort === "auto" ? {} : { reasoning: { effort: requestConfig.reasoningEffort } }),
        }, onDelta, options)).content || apiText("noContent");
        if (answer === apiText("noContent")) onDelta(answer);
        return answer;
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("requestFailed")));
    }
}

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">) {
    try {
        if (config.apiFormat === "gemini") {
            const response = await axios.get<GeminiPayload>(geminiApiUrl({ ...defaultGeminiConfig, ...config }), { headers: geminiHeaders({ ...defaultGeminiConfig, ...config }) });
            validateGeminiPayload(response.data);
            return (response.data.models || [])
                .map((model) => model.name?.replace(/^models\//, ""))
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
        }
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("modelReadFailed")));
    }
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat });
}

const defaultGeminiConfig: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "model" | "systemPrompt"> = {
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    apiFormat: "gemini",
    model: "",
    systemPrompt: "",
};
