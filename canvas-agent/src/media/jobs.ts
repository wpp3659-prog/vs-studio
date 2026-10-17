import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "../utils/logger.js";

/**
 * 媒体生成任务的可持续性执行。
 *
 * 浏览器刷新会中断页面里的 fetch，同步接口（如 gpt-image）的生成结果就此丢失。
 * 这里把「调上游」这一步搬到常驻服务里执行，页面只负责轮询任务号：
 * 页面刷新、关标签都不影响任务继续跑，结果落盘后等页面回来取。
 */

/** 任务保持多久后清理（7 天）。 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** 结果文件最大保留数量，超出按时间淘汰最旧的。 */
const MAX_RESULTS = 500;

export type MediaJobKind = "image" | "imageEdit" | "video" | "audio" | "text";

export type MediaJobStatus = "running" | "done" | "failed" | "canceled";

export type MediaJobRecord = {
    id: string;
    kind: MediaJobKind;
    status: MediaJobStatus;
    createdAt: number;
    updatedAt: number;
    /** 上游接口地址与模型，续查和排查用。 */
    baseUrl: string;
    model: string;
    /** 失败原因，直接展示给用户。 */
    error?: string;
    /** 结果文件名（位于结果目录），成功后才有。 */
    resultFile?: string;
    /** 结果的 MIME 类型。 */
    contentType?: string;
    /** 文本任务直接存字符串结果。 */
    text?: string;
    /** 前端展示用标题，便于用户在任务列表里辨认。 */
    title?: string;
};

type JobRuntime = {
    controller: AbortController;
    promise: Promise<void>;
};

const jobs = new Map<string, MediaJobRecord>();
const runtimes = new Map<string, JobRuntime>();
let jobsDir = "";

function jobsFile() {
    return path.join(jobsDir, "jobs.json");
}

function resultPath(fileName: string) {
    return path.join(jobsDir, fileName);
}

async function persistJobs() {
    try {
        await mkdir(jobsDir, { recursive: true });
        const temp = `${jobsFile()}.tmp`;
        await writeFile(temp, JSON.stringify([...jobs.values()]), "utf8");
        // 先写临时文件再改名，避免进程被杀留下半截 JSON 把任务表读坏。
        await rename(temp, jobsFile());
    } catch (error) {
        logger.warn(`保存生成任务表失败: ${(error as Error).message}`);
    }
}

/** 服务启动时调用：建目录、读回上次的任务表、把「重启前还在跑」的任务标成可续查失败。 */
export async function initMediaJobs(directory: string) {
    jobsDir = directory;
    await mkdir(jobsDir, { recursive: true });
    let saved: MediaJobRecord[] = [];
    try {
        saved = JSON.parse(await readFile(jobsFile(), "utf8")) as MediaJobRecord[];
    } catch {
        saved = [];
    }
    const now = Date.now();
    for (const job of saved) {
        if (now - job.createdAt > RETENTION_MS) continue;
        // 上次进程退出时仍在跑的任务已经失去执行器，如实标记而不是永远停在 running。
        if (job.status === "running") {
            jobs.set(job.id, { ...job, status: "failed", error: "服务重启，任务已中断", updatedAt: now });
            continue;
        }
        jobs.set(job.id, job);
    }
    await cleanupMediaJobs();
    await persistJobs();
}

async function cleanupMediaJobs() {
    const now = Date.now();
    const alive: MediaJobRecord[] = [];
    for (const job of jobs.values()) {
        if (now - job.createdAt > RETENTION_MS) {
            if (job.resultFile) await unlink(resultPath(job.resultFile)).catch(() => undefined);
            continue;
        }
        alive.push(job);
    }
    const finished = alive.filter((job) => job.status !== "running").sort((a, b) => b.createdAt - a.createdAt);
    for (const job of finished.slice(MAX_RESULTS)) {
        if (job.resultFile) await unlink(resultPath(job.resultFile)).catch(() => undefined);
        jobs.delete(job.id);
    }
}

export function getMediaJob(jobId: string) {
    return jobs.get(jobId) || null;
}

export function listMediaJobs() {
    return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function cancelMediaJob(jobId: string) {
    const runtime = runtimes.get(jobId);
    const job = jobs.get(jobId);
    if (!job) return false;
    if (runtime) runtime.controller.abort();
    if (job.status === "running") {
        jobs.set(jobId, { ...job, status: "canceled", error: "已取消", updatedAt: Date.now() });
        void persistJobs();
    }
    return true;
}

/**
 * 登记并执行一个媒体任务。
 * execute 负责真正调上游并把结果返回；抛错即任务失败，错误信息原样保留给页面展示。
 */
export function startMediaJob(
    meta: { kind: MediaJobKind; baseUrl: string; model: string; title?: string },
    execute: (signal: AbortSignal) => Promise<{ data: string; contentType: string } | { text: string }>,
) {
    const id = randomUUID();
    const now = Date.now();
    const job: MediaJobRecord = { id, kind: meta.kind, status: "running", createdAt: now, updatedAt: now, baseUrl: meta.baseUrl, model: meta.model, title: meta.title };
    jobs.set(id, job);
    const controller = new AbortController();
    const promise = (async () => {
        try {
            const result = await execute(controller.signal);
            if ("text" in result) {
                jobs.set(id, { ...job, status: "done", text: result.text, updatedAt: Date.now() });
            } else {
                const ext = extensionFor(result.contentType);
                const fileName = `${id}.${ext}`;
                await writeFile(resultPath(fileName), Buffer.from(result.data, "base64"));
                jobs.set(id, { ...job, status: "done", resultFile: fileName, contentType: result.contentType, updatedAt: Date.now() });
            }
        } catch (error) {
            const message = (error as Error)?.message || "生成失败";
            const canceled = (error as Error)?.name === "AbortError" || controller.signal.aborted;
            jobs.set(id, { ...job, status: canceled ? "canceled" : "failed", error: canceled ? "已取消" : message, updatedAt: Date.now() });
        } finally {
            runtimes.delete(id);
            await persistJobs();
            void cleanupMediaJobs();
        }
    })();
    runtimes.set(id, { controller, promise });
    void persistJobs();
    return jobs.get(id)!;
}

export async function readMediaJobResult(job: MediaJobRecord) {
    if (!job.resultFile) return null;
    try {
        return await readFile(resultPath(job.resultFile));
    } catch {
        return null;
    }
}

function extensionFor(contentType: string) {
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("gif")) return "gif";
    if (contentType.includes("mp4")) return "mp4";
    if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
    if (contentType.includes("wav")) return "wav";
    return "png";
}

/** 测试与排查辅助：当前执行中的任务数量。 */
export function runningMediaJobCount() {
    return runtimes.size;
}

/** 列出结果目录里的文件名，供排查「结果是否真的落盘」。 */
export async function listMediaJobFiles() {
    try {
        return await readdir(jobsDir);
    } catch {
        return [];
    }
}
