import { useAgentStore } from "@/stores/use-agent-store";

/**
 * 生成任务交给本地 Agent 执行。
 *
 * 之前是浏览器直连上游：一旦刷新页面，fetch 被浏览器掐断，同步接口（gpt-image 这类）
 * 的结果就永久丢失，只能重新发一次、再扣一次钱。改成把请求交给常驻的本地 Agent 后，
 * 页面只是「提交任务 + 轮询任务号」，刷新、关标签都不影响上游那次请求继续跑。
 */

export type MediaJobStatus = "running" | "done" | "failed" | "canceled";

export type MediaJob = {
    id: string;
    kind: "image" | "imageEdit" | "video" | "audio" | "text";
    status: MediaJobStatus;
    createdAt: number;
    updatedAt: number;
    model: string;
    error?: string;
    text?: string;
    title?: string;
};

export type CreateMediaJobInput = {
    kind: MediaJob["kind"];
    baseUrl: string;
    apiKey: string;
    path: string;
    model: string;
    body?: unknown;
    title?: string;
    timeoutMs?: number;
};

/** Agent 没连上时直接跳过，不要让生图卡在这里等。 */
function agentConnection(timeoutMs = 1500) {
    const { url, token, enabled } = useAgentStore.getState();
    if (!enabled || !url || !token) return null;
    return { endpoint: url.replace(/\/+$/, ""), token, timeoutMs };
}

async function agentFetch(path: string, init?: RequestInit, timeoutMs = 1500) {
    const connection = agentConnection(timeoutMs);
    if (!connection) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${connection.endpoint}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(connection.token)}`, {
            cache: "no-store",
            ...init,
            signal: controller.signal,
        });
        return response;
    } catch {
        return null;
    } finally {
        window.clearTimeout(timer);
    }
}

export type AgentJobResult = { job: MediaJob; images: string[] };

/** 提交任务。Agent 不可用时返回 null，调用方回退成浏览器直连。 */
export async function createMediaJob(input: CreateMediaJobInput) {
    const response = await agentFetch("/media/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!response?.ok) return null;
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; job?: MediaJob } | null;
    return payload?.job?.id ? payload.job : null;
}

export async function readMediaJob(jobId: string) {
    const response = await agentFetch(`/media/jobs/${encodeURIComponent(jobId)}`);
    if (!response?.ok) return null;
    const payload = (await response.json().catch(() => null)) as { job?: MediaJob } | null;
    return payload?.job || null;
}

export async function cancelMediaJob(jobId: string) {
    await agentFetch(`/media/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }, 3000);
}

/** 结果直接按任务号取图，读成 data URL 交回原有的出图流程。 */
async function readJobImage(jobId: string) {
    const connection = agentConnection(60_000);
    if (!connection) throw new Error("本地服务已断开");
    const response = await fetch(`${connection.endpoint}/media/jobs/${encodeURIComponent(jobId)}/result?token=${encodeURIComponent(connection.token)}`, { cache: "no-store" });
    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "取生成结果失败");
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("生成结果读取失败"));
        reader.readAsDataURL(blob);
    });
}

const JOB_POLL_INTERVAL_MS = 2000;

/**
 * 等到任务结束并把结果读出来。
 * signal 只影响「本次等待」，不影响上游那次请求——这也是刷新后回来还能接着等的原因。
 */
export async function waitMediaJob(jobId: string, options?: { signal?: AbortSignal; onJob?: (job: MediaJob) => void }): Promise<string[]> {
    for (;;) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const job = await readMediaJob(jobId);
        if (!job) throw new Error("生成任务已失效，请重试");
        options?.onJob?.(job);
        if (job.status === "failed") throw new Error(job.error || "生成失败");
        if (job.status === "canceled") throw new Error("已取消");
        if (job.status === "done") return [await readJobImage(jobId)];
        await new Promise((resolve) => window.setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    }
}

/** 提交并等待：一步完成生图，供各画布入口复用。 */
export async function runMediaJob(input: CreateMediaJobInput, options?: { signal?: AbortSignal; onJobCreated?: (jobId: string) => void }) {
    const job = await createMediaJob(input);
    if (!job) return null;
    options?.onJobCreated?.(job.id);
    return await waitMediaJob(job.id, { signal: options?.signal });
}
