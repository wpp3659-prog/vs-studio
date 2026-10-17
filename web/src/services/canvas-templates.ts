import localforage from "localforage";

import { STORAGE_DB_NAME } from "@/lib/localforage-storage";
import type { CanvasTemplate } from "@/lib/canvas/canvas-templates";

const store = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "canvas_templates" });
const LIST_KEY = "items";

/** 读取全部画布模板，最近的排前面。 */
export async function listCanvasTemplates(): Promise<CanvasTemplate[]> {
    if (typeof window === "undefined") return [];
    try {
        const items = await store.getItem<CanvasTemplate[]>(LIST_KEY);
        return Array.isArray(items) ? [...items].sort((a, b) => b.createdAt - a.createdAt) : [];
    } catch {
        return [];
    }
}

/** 新增或覆盖一个模板。 */
export async function saveCanvasTemplate(template: CanvasTemplate): Promise<CanvasTemplate[]> {
    const items = await listCanvasTemplates();
    const next = [template, ...items.filter((item) => item.id !== template.id)];
    await store.setItem(LIST_KEY, next);
    return next;
}

/** 删除模板。 */
export async function deleteCanvasTemplate(id: string): Promise<CanvasTemplate[]> {
    const next = (await listCanvasTemplates()).filter((item) => item.id !== id);
    await store.setItem(LIST_KEY, next);
    return next;
}
