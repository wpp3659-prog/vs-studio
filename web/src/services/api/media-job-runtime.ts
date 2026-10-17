import { readMediaJob } from "./media-jobs";

/**
 * 记录画布上哪些节点正在等本地 Agent 出结果。
 *
 * 真正的请求在 Agent 里跑，页面只是等结果；所以刷新页面不会让生成中断。
 * 但「哪个节点在等哪个任务、当初用的什么参数」只活在页面内存里，刷新就没了，
 * 这里把它落到 localStorage，刷新后照着重连，重连用的是任务号，不会再发一次请求、再扣一次钱。
 */

const STORAGE_KEY = "vs-studio:media-jobs";
/** 超过这个时间还没回来就不管了，避免长期堆积。 */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** 最多记这么多条，一条就是一次生图。 */
const MAX_ENTRIES = 60;

export type MediaJobTask = {
    jobId: string;
    /** 结果要写回哪个画布、哪个节点、哪个槽位。 */
    projectId: string;
    nodeId: string;
    imageId?: string;
    kind: "image";
    startedAt: number;
};

type Listener = (tasks: MediaJobTask[]) => void;

let tasks: MediaJobTask[] = load();
const listeners = new Set<Listener>();
let polling = false;

function load(): MediaJobTask[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as MediaJobTask[];
        const now = Date.now();
        return parsed.filter((task) => task?.jobId && task?.nodeId && now - task.startedAt < MAX_AGE_MS);
    } catch {
        return [];
    }
}

function save() {
    if (typeof window === "undefined") return;
    tasks = tasks.slice(-MAX_ENTRIES);
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {}
}

function emit() {
    for (const listener of listeners) listener(tasks);
}

export function getMediaJobTasks() {
    return tasks;
}

export function subscribeMediaJobTasks(listener: Listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/** 任务提交成功后登记，页面刷新后靠它重连。返回清理函数，任务结束时调用。 */
export function registerMediaJobTask(task: Omit<MediaJobTask, "startedAt">) {
    tasks = [...tasks.filter((item) => item.jobId !== task.jobId), { ...task, startedAt: Date.now() }];
    save();
    emit();
    void watch();
    return () => void completeMediaJobTask(task.jobId);
}

export function completeMediaJobTask(jobId: string) {
    const next = tasks.filter((task) => task.jobId !== jobId);
    if (next.length === tasks.length) return;
    tasks = next;
    save();
    emit();
}

/** 当前节点是否还有在跑的生成任务，界面据此保持「生成中」。 */
export function hasMediaJobForNode(nodeId: string) {
    return tasks.some((task) => task.nodeId === nodeId);
}

/** 有登记的任务就每隔几秒问一次状态，直到全部结束。 */
async function watch() {
    if (polling) return;
    polling = true;
    try {
        while (tasks.length) {
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
            const snapshot = [...tasks];
            for (const task of snapshot) {
                const job = await readMediaJob(task.jobId).catch(() => null);
                if (!job) continue;
                if (job.status === "done") await pullMediaJobResult(task);
                else if (job.status === "failed" || job.status === "canceled") completeMediaJobTask(task.jobId);
            }
        }
    } finally {
        polling = false;
    }
}

/** 结果读成 data URL 写回画布节点，和以前直接调接口的收尾流程一致。 */
async function pullMediaJobResult(task: MediaJobTask) {
    const { endpoint, token } = agentCredentials();
    if (!endpoint) return;
    try {
        const response = await fetch(`${endpoint}/media/jobs/${encodeURIComponent(task.jobId)}/result?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("取生成结果失败");
        const dataUrl = await blobToDataUrl(await response.blob());
        // 动态引用，避免存储层与出图流程互相 import。
        const { applyMediaJobResult } = await import("./media-job-result");
        await applyMediaJobResult({ projectId: task.projectId, nodeId: task.nodeId, imageId: task.imageId, dataUrl });
    } catch {
        // 拉取失败保留登记，下一轮继续试；节点状态由存储层负责保持「生成中」。
        return;
    }
    completeMediaJobTask(task.jobId);
}

export function agentCredentials() {
    if (typeof window === "undefined") return { endpoint: "", token: "" };
    return { endpoint: (window.localStorage.getItem("canvas-agent-url") || "").replace(/\/+$/, ""), token: window.localStorage.getItem("canvas-agent-token") || "" };
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("生成结果读取失败"));
        reader.readAsDataURL(blob);
    });
}
