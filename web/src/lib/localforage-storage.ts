import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

/** 本地 IndexedDB 库名。改名会让已有数据「消失」，改动时必须配套迁移。 */
export const STORAGE_DB_NAME = "vs-studio";
/** 改造前的库名，仅用于一次性搬迁。 */
export const LEGACY_STORAGE_DB_NAME = "infinite-canvas";

/**
 * 库里用到的全部 store。迁移时要逐个搬，localforage 没有「列出所有 store」的接口，
 * 只能按这份清单遍历，所以新增 store 时必须同步登记到这里。
 */
const STORE_NAMES = [
    "app_state",
    "image_files",
    "image_previews",
    "image_generation_logs",
    "video_generation_logs",
    "media_files",
    "prompt_cache",
    "canvas_templates",
];

const MIGRATION_FLAG = "vs-studio:indexeddb-migrated";

/**
 * 把旧库（infinite-canvas）里的数据整体搬到新库（vs-studio）。
 *
 * IndexedDB 中 localforage 的「库名」对应独立的 database，改名后旧数据不会自动跟随，
 * 必须逐个 store 读出再写回。已迁移过（或全新安装）时直接返回。
 * 迁移失败不抛错：宁可让用户看到空列表，也不能让页面起不来。
 */
export async function migrateLegacyStorage() {
    if (typeof window === "undefined") return;
    try {
        if (window.localStorage.getItem(MIGRATION_FLAG)) return;
        for (const storeName of STORE_NAMES) {
            try {
                const source = localforage.createInstance({ name: LEGACY_STORAGE_DB_NAME, storeName });
                const keys = await source.keys().catch(() => [] as string[]);
                if (!keys.length) continue;
                const target = localforage.createInstance({ name: STORAGE_DB_NAME, storeName });
                for (const key of keys) {
                    const value = await source.getItem(key);
                    if (value !== null) await target.setItem(key, value);
                }
            } catch {
                // 单个 store 搬失败不影响其它 store，继续处理下一个。
            }
        }
        window.localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    } catch {
        // 迁移异常时保持沉默，避免阻断应用启动。
    }
}

localforage.config({
    name: STORAGE_DB_NAME,
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            return (await localforage.getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};
