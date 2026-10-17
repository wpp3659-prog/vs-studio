import { logger } from "../utils/logger.js";

/**
 * 在服务端调用 OpenAI 兼容的生图接口。
 *
 * 只做「转发 + 取图」这一件事：参数原样透传，避免在服务端重复实现前端的尺寸/模型规则。
 * 界面里的请求原本是浏览器直连上游（含本地代理），这里沿用同一套地址与鉴权方式。
 */

export type UpstreamImageRequest = {
    baseUrl: string;
    apiKey: string;
    /** 完整路径，例如 /v1/images/generations，由前端按渠道规则拼好。 */
    path: string;
    /** JSON 请求体；multipart 场景走 body 字段。 */
    body?: unknown;
    /** 表单形式的编辑请求（带参考图）。 */
    form?: FormData;
    timeoutMs?: number;
};

type ImageResult = { data: string; contentType: string };

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 编辑接口原本是表单上传。服务端接不到浏览器的 File 对象，前端会把文件字段转成 data URL 一起发过来，
 * 这里还原成表单再发上游，保证上游收到的还是 multipart，行为和以前一致。
 */
function jsonToFormData(body: unknown) {
    if (!body || typeof body !== "object") return null;
    const entries = Object.entries(body as Record<string, unknown>);
    if (!entries.some(([, value]) => typeof value === "string" && /^data:[^;]+;base64,/.test(value) || Array.isArray(value) && value.some((item) => typeof item === "string" && /^data:/.test(item)))) return null;
    const form = new FormData();
    for (const [key, value] of entries) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
            if (typeof item !== "string" || !/^data:[^;]+;base64,/.test(item)) continue;
            const matched = item.match(/^data:([^;]+);base64,(.*)$/);
            if (!matched) continue;
            const extension = matched[1].split("/")[1]?.replace("jpeg", "jpg") || "png";
            form.append(key, new Blob([Buffer.from(matched[2], "base64")], { type: matched[1] }), `reference.${extension}`);
        }
    }
    for (const [key, value] of entries) {
        if (typeof value === "string" && !/^data:/.test(value)) form.set(key, value);
        else if (typeof value === "number" || typeof value === "boolean") form.set(key, String(value));
    }
    return form;
}

export function joinApiUrl(baseUrl: string, apiPath: string) {
    const root = baseUrl.trim().replace(/\/+$/, "");
    const suffix = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    // 已是 /v1 结尾时不要重复拼接，和前端 buildApiUrl 的规则保持一致。
    if (root.endsWith("/v1") && suffix.startsWith("/v1/")) return `${root}${suffix.slice(3)}`;
    return `${root}${suffix}`;
}

function readImageSources(payload: unknown): string[] {
    const sources: string[] = [];
    // b64_json 里的 base64 很短时（纯白小图等）不带 data: 前缀，之前会被当成普通文本丢掉。
    const collect = (value: string) => {
        if (/^data:image[/]/.test(value) || /^https?:\/\//.test(value)) sources.push(value);
        else if (/^[A-Za-z0-9+/=\s]{32,}$/.test(value)) sources.push(value);
    };
    const visit = (value: unknown, depth: number) => {
        if (depth > 6 || !value) return;
        if (typeof value === "string") {
            collect(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => visit(item, depth + 1));
            return;
        }
        if (typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        const preferred = ["data", "output", "result", "results", "artifacts", "images", "image_urls", "imageUrls", "url", "b64_json", "image_url"];
        for (const key of preferred) if (key in record) visit(record[key], depth + 1);
        if (!preferred.some((key) => key in record)) Object.values(record).forEach((item) => visit(item, depth + 1));
    };
    visit(payload, 0);
    return [...new Set(sources)];
}

/** 上游返回的字符串可能是 base64（不带前缀），统一补成 data URL。 */
function normalizeToDataUrl(source: string) {
    if (/^data:/.test(source)) return source;
    if (/^https?:\/\//.test(source)) return source;
    if (/^[A-Za-z0-9+/=\s]+$/.test(source) && source.length > 24) return `data:image/png;base64,${source.replace(/\s/g, "")}`;
    return "";
}

async function downloadAsBase64(url: string, signal: AbortSignal, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`下载生成结果失败 (HTTP ${response.status})`);
        const contentType = response.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await response.arrayBuffer());
        return { data: buffer.toString("base64"), contentType };
    } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
    }
}

async function toResult(source: string, signal: AbortSignal, timeoutMs: number): Promise<ImageResult> {
    const normalized = normalizeToDataUrl(source);
    if (!normalized) throw new Error("上游返回的图片格式无法识别");
    if (/^https?:\/\//.test(normalized)) return downloadAsBase64(normalized, signal, timeoutMs);
    const match = normalized.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new Error("上游返回的图片数据无法解析");
    return { data: match[2], contentType: match[1] };
}

function readErrorMessage(payload: unknown) {
    if (!payload) return "";
    if (typeof payload === "string") return payload.slice(0, 300);
    if (typeof payload !== "object") return "";
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string") return message;
    }
    for (const key of ["message", "msg", "detail", "description"]) {
        const value = record[key];
        if (typeof value === "string" && value) return value;
    }
    return "";
}

/**
 * 提交一次生图请求并返回第一张可用的图。
 * 支持上游回 202 建任务的情况：按任务编号轮询到出图为止。
 */
export async function requestUpstreamImage(request: UpstreamImageRequest, signal: AbortSignal): Promise<ImageResult> {
    const timeoutMs = request.timeoutMs || DEFAULT_TIMEOUT_MS;
    const url = joinApiUrl(request.baseUrl, request.path);
    const headers: Record<string, string> = { Authorization: `Bearer ${request.apiKey}`, Prefer: "respond-async" };
    let body: BodyInit | undefined;
    const formBody = request.form ? null : jsonToFormData(request.body);
    if (request.form) {
        body = request.form;
    } else if (formBody) {
        body = formBody;
    } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(request.body ?? {});
    }
    // 超时只约束「单次 HTTP 等待」，不能拿取消信号当超时用：
    // 否则取消任务时会走进正常的失败分支，把真实失败原因覆盖成「请求已取消」。
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    // 任务被取消时要真的把上游连接掐掉，否则请求会一直挂到出图为止。
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
        const text = await response.text();
        let payload: unknown = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch {
            payload = text;
        }
        if (!response.ok) {
            // 网关错误页常常是整页 HTML，直接给出可读提示而不是把源码抛给用户。
            const upstream = readErrorMessage(payload);
            const looksHtml = /<[a-z][\s\S]*>/i.test(String(upstream || text));
            throw new Error(upstream && !looksHtml ? upstream : `上游返回 ${response.status}${looksHtml ? "（网关错误页）" : ""}`);
        }
        const sources = readImageSources(payload);
        if (sources.length) return toResult(sources[0], signal, timeoutMs);
        const taskId = readTaskId(response.status, payload);
        if (taskId) return pollTask(request.baseUrl, request.apiKey, taskId, signal, timeoutMs);
        throw new Error(readErrorMessage(payload) || "上游没有返回图片");
    } catch (error) {
        if ((error as Error)?.name === "AbortError") throw new Error(signal.aborted && !timedOut ? "已取消" : "生图请求超时，请稍后重试");
        throw error;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
    }
}

function readTaskId(status: number, payload: unknown) {
    if (status !== 202 || !payload || typeof payload !== "object") return "";
    const record = payload as Record<string, unknown>;
    for (const key of ["id", "taskId", "task_id"]) {
        const value = record[key];
        if (typeof value === "string" && value) return value;
    }
    return "";
}

async function pollTask(baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal, timeoutMs: number) {
    const id = encodeURIComponent(taskId);
    const statusUrl = joinApiUrl(baseUrl, `/v1/images/tasks/${id}`);
    const resultUrl = joinApiUrl(baseUrl, `/v1/images/tasks/${id}/result`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const payload = await getJson(statusUrl, apiKey, signal).catch(() => null);
        const sources = readImageSources(payload);
        if (sources.length) return toResult(sources[0], signal, timeoutMs);
        const record = (payload || {}) as Record<string, unknown>;
        const status = String(record.status || record.state || "").toUpperCase();
        if (["FAILURE", "FAILED", "CANCEL", "CANCELLED"].includes(status)) throw new Error(readErrorMessage(payload) || "上游任务失败");
        if (["SUCCESS", "SUCCEEDED", "COMPLETED", "DONE"].includes(status)) {
            const result = await getJson(resultUrl, apiKey, signal).catch(() => null);
            const resultSources = readImageSources(result);
            if (resultSources.length) return toResult(resultSources[0], signal, timeoutMs);
            throw new Error(readErrorMessage(result || payload) || "任务完成但没有返回图片");
        }
        if (Date.now() >= deadline) throw new Error("生图任务超时，请稍后重试");
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
}

async function getJson(url: string, apiKey: string, signal: AbortSignal) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    const text = await response.text();
    if (!response.ok) {
        logger.debug(`任务查询失败 HTTP ${response.status}，${url}`);
        throw new Error(`任务查询失败 (HTTP ${response.status})`);
    }
    return text ? (JSON.parse(text) as unknown) : null;
}
