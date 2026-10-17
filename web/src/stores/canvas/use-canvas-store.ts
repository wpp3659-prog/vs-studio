import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

export type CanvasDeletedProject = {
    id: string;
    deletedAt: string;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "vs-studio:canvas_store";
/** 画布的同步备份，专门给「刷新时 IndexedDB 还没写完」兜底。 */
const BACKUP_KEY = "vs-studio:canvas_store:sync-backup";
type PersistedCanvasState = Pick<CanvasStore, "projects" | "deletedProjects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let queuedPersistValue: StorageValue<CanvasStore> | null = null;

/**
 * 画布保存默认延迟 400ms，避免拖动节点时频繁写库。
 * 但「任务号、生成状态」这类信息如果没来得及落盘就被刷新冲掉，任务就接不回来了（连续刷新最容易踩），
 * 所以这类变更直接立即写盘。
 */
const URGENT_NODE_KEYS = ["status", "imageTaskId", "videoTaskId", "primaryImageId", "content", "storageKey"] as const;

function sameNodesLite(a?: CanvasNodeData[], b?: CanvasNodeData[]) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((node, index) => node === b[index]);
}

function hasUrgentChanges(previous: PersistedCanvasState | null, next: PersistedCanvasState) {
    if (!previous) return true;
    const previousById = new Map(previous.projects.map((project) => [project.id, project.nodes]));
    return next.projects.some((project) => {
        const before = previousById.get(project.id);
        if (!before || sameNodesLite(before, project.nodes)) return false;
        if (before.length !== project.nodes.length) return true;
        return project.nodes.some((node, index) => {
            const old = before[index];
            if (old === node) return false;
            if (old.id !== node.id) return true;
            return URGENT_NODE_KEYS.some((key) => old.metadata?.[key] !== node.metadata?.[key]);
        });
    });
}

function flushPersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const value = queuedPersistValue;
    if (!value) return;
    queuedPersistValue = null;
    const text = JSON.stringify(value);
    // IndexedDB 写入是异步的，刷新/关标签时可能还没落完。同时往 localStorage 写一份同步备份，
    // 下次启动时两边比时间戳取新的，避免「代码全对但数据被旧快照盖回去」。
    try {
        window.localStorage.setItem(BACKUP_KEY, text);
    } catch {
        // 画布很大时 localStorage 可能超限，IndexedDB 那条路仍然有效。
    }
    void localForageStorage.setItem(CANVAS_STORE_KEY, text);
}

/** 比较两份画布快照的新旧，用于在 IndexedDB 与同步备份之间选最新的那份。 */
function newestCanvasSnapshot(a: StorageValue<CanvasStore> | null, b: StorageValue<CanvasStore> | null) {
    if (!a) return b;
    if (!b) return a;
    const updatedAt = (value: StorageValue<CanvasStore>) =>
        Math.max(0, ...(((value.state as PersistedCanvasState)?.projects || []).map((project) => Date.parse(project.updatedAt) || 0)));
    return updatedAt(a) >= updatedAt(b) ? a : b;
}

function readBackupSnapshot() {
    try {
        const raw = window.localStorage.getItem(BACKUP_KEY);
        return raw ? (JSON.parse(raw) as StorageValue<CanvasStore>) : null;
    } catch {
        return null;
    }
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const raw = await localForageStorage.getItem(name);
        const fromDatabase = raw ? (JSON.parse(raw) as StorageValue<CanvasStore>) : null;
        const parsed = newestCanvasSnapshot(fromDatabase, readBackupSnapshot()) || fromDatabase;
        if (!parsed) return null;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.deletedProjects === nextState.deletedProjects) return;
        const urgent = hasUrgentChanges(queuedPersistState, nextState);
        queuedPersistState = nextState;
        queuedPersistValue = value;
        if (urgent) {
            // 状态类变更不排队，写完再继续；否则刷新会把任务号吃掉。
            flushPersist();
            return;
        }
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            flushPersist();
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

/** 页面要走了（刷新、关标签）时，把还在排队的状态立刻写掉。 */
if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushPersist);
    window.addEventListener("beforeunload", flushPersist);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushPersist();
    });
}

/** 画布生成状态变化后调用，把排队中的画布立刻落盘，避免紧接着的刷新把任务号冲掉。 */
export function flushCanvasPersist() {
    flushPersist();
}

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            deletedProjects: [],
            createProject: (title = i18n.t("canvas.project.untitled")) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || i18n.t("canvas.project.imported"),
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const removing = new Set(ids);
                    const projects = state.projects.filter((project) => !removing.has(project.id));
                    const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => ({ id, deletedAt: now }))];
                    return { projects, deletedProjects };
                }),
            replaceProjects: (projects, deletedProjects = []) => set({ projects, deletedProjects }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                    deletedProjects: state.deletedProjects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);
