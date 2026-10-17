import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { withLocalProxy } from "@/stores/use-config-store";
import { createImageThumbnail } from "@/lib/image-thumbnail";
import { STORAGE_DB_NAME } from "@/lib/localforage-storage";

export type UploadedImage = {
    url: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "image_files" });
const previewStore = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "image_previews" });
const imageLogStore = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: STORAGE_DB_NAME, storeName: "video_generation_logs" });
const objectUrls = new Map<string, string>();
const previewUrls = new Map<string, string>();
const previewListeners = new Set<() => void>();
let previewRevision = 0;
let previewQueue: Promise<unknown> = Promise.resolve();
const IMAGE_PREVIEW_VERSION = 1;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_REMOTE_LOAD_TIMEOUT_MS = 10 * 60_000;
/**
 * 解码超时只兜「解不出来」这种情况，不能当成性能预算。
 * 20MB 以上的大图（尤其手机/相机原图）首次解码要十几秒，以前给的 10 秒会把
 * 已经成功下载的图当成失败丢掉，体感就是「上游出图了但画布上没有」。
 */
const IMAGE_DECODE_TIMEOUT_MS = 90_000;
const IMAGE_RESPONSE_ERROR = "ImageResponseError";
const IMAGE_TIMEOUT_ERROR = "ImageTimeoutError";
/** 超大图先落盘保住，缩略图放到后台补，别让它拖住生成流程。 */
const IMAGE_PREVIEW_INLINE_MAX_BYTES = 8 * 1024 * 1024;

type StoredImagePreview = { version: number; blob?: Blob };

type ImageReadOptions = { signal?: AbortSignal };

export async function uploadImage(input: string | Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    if (typeof input !== "string") return storeImage(input, options);

    if (typeof input === "string" && /^blob:/i.test(input)) return keepRemoteImage(input, options);
    // 图片本身就是 data URL（中转直接回 base64 时很常见，大图能有 30~40MB 字符串）：
    // 别绕 fetch，直接按二进制存，省一次整串拷贝和解析。
    if (/^data:[^,]*,/i.test(input)) return storeImage(await dataUrlToBlob(input), options);

    let blob: Blob;
    try {
        blob = await fetchImageBlob(input, options);
    } catch (error) {
        // 远端地址用 fetch 失败（CORS 拦截或返回非 2xx）时，再用 <img> 试一次：
        // 图片标签不受 CORS 限制，很多图床/中转只在 fetch 场景下失败。
        if (options?.signal?.aborted || isNamedError(error, IMAGE_TIMEOUT_ERROR) || !/^https?:\/\//i.test(input)) throw error;
        const meta = await loadImageMeta(input, options, IMAGE_REMOTE_LOAD_TIMEOUT_MS);
        if (!meta) throw error;
        return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
    }
    return storeImage(blob, options);
}

/** 已经是临时地址（blob:）时不要去 fetch：本地 blob 可能已经被别处 revoke。 */
async function keepRemoteImage(url: string, options?: ImageReadOptions): Promise<UploadedImage> {
    const meta = await readImageMetaSafely(url, options);
    if (options?.signal?.aborted) throw abortReason(options.signal);
    return { url, width: meta?.width || 0, height: meta?.height || 0, bytes: 0, mimeType: "" };
}

async function storeImage(blob: Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const storageKey = `image:${nanoid()}`;
    const url = URL.createObjectURL(blob);
    const fallback = { url, width: 0, height: 0, bytes: blob.size, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
    // 尺寸读不出来不是致命错误：图已经在手上，节点哪怕只在界面上显示这一次也不能丢。
    const meta = (await readImageMetaSafely(url, options)) || {};
    if (options?.signal?.aborted) {
        URL.revokeObjectURL(url);
        throw abortReason(options.signal);
    }
    try {
        await store.setItem(storageKey, blob);
        objectUrls.set(storageKey, url);
    } catch {
        // 写 IndexedDB 失败（配额不够、浏览器限制等）时保留当前会话的临时地址，
        // 至少刷新前能正常显示；节点数据里 storageKey 留空，刷新后会如实提示读不到图。
        return { ...fallback, ...meta };
    }
    if (blob.size > IMAGE_PREVIEW_INLINE_MAX_BYTES) queueImagePreview(storageKey);
    else await storeImagePreview(storageKey, blob);
    return { ...fallback, ...meta, storageKey };
}

async function readImageMetaSafely(url: string, options?: ImageReadOptions) {
    try {
        return await loadImageMeta(url, options);
    } catch {
        // 只有「用户取消」需要冒泡；解码超时/失败按无尺寸处理，图照样保留。
        if (options?.signal?.aborted) throw abortReason(options.signal);
        return null;
    }
}

async function fetchImageBlob(url: string, options?: ImageReadOptions) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (options?.signal?.aborted) abort();
    else options?.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, IMAGE_DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(withLocalProxy(url), { signal: controller.signal });
        if (!response.ok) throw namedError(IMAGE_RESPONSE_ERROR);
        return await response.blob();
    } catch (error) {
        if (timedOut) throw namedError(IMAGE_TIMEOUT_ERROR);
        if (options?.signal?.aborted) throw abortReason(options.signal);
        throw error;
    } finally {
        window.clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
    }
}

function loadImageMeta(url: string, options?: ImageReadOptions, timeoutMs = IMAGE_DECODE_TIMEOUT_MS) {
    return new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        if (options?.signal?.aborted) return reject(abortReason(options.signal));
        const image = new Image();
        let settled = false;
        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const abort = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            reject(abortReason(options!.signal!));
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        options?.signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => {
            if (image.naturalWidth && image.naturalHeight) return finish({ width: image.naturalWidth, height: image.naturalHeight });
            // 浏览器对超大图可能先用 onload 报一个 0×0，这时再等一次 decode 拿真实尺寸。
            const decode = image.decode?.();
            if (!decode) return finish(null);
            void decode.then(
                () => finish(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null),
                () => finish(null),
            );
        };
        image.onerror = () => finish(null);
        image.src = url;
    });
}

function namedError(name: string, message = i18n.t("common.imageReadFailed")) {
    const error = new Error(name === IMAGE_TIMEOUT_ERROR ? i18n.t("common.imageDownloadTimeout") : message);
    error.name = name;
    return error;
}

function isNamedError(error: unknown, name: string) {
    return error instanceof Error && error.name === name;
}

function abortReason(signal: AbortSignal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

// 缩略图按图片的 storageKey 另存一份 WebP，只放在本地 IndexedDB 里，不写进节点数据，也不参与导出和 WebDAV 同步。
export function previewUrlFor(storageKey?: string) {
    return storageKey ? previewUrls.get(storageKey) : undefined;
}

// 缩略图在后台补，生成完成后再让用到它的界面重渲染一次。
export function subscribeImagePreviews(listener: () => void) {
    previewListeners.add(listener);
    return () => {
        previewListeners.delete(listener);
    };
}

export function getImagePreviewRevision() {
    return previewRevision;
}

export async function ensureImagePreview(storageKey?: string) {
    if (!storageKey) return undefined;
    const cached = previewUrls.get(storageKey);
    if (cached) return cached;
    const stored = await previewStore.getItem<StoredImagePreview>(storageKey).catch(() => null);
    if (stored?.version === IMAGE_PREVIEW_VERSION) return stored.blob ? cacheImagePreview(storageKey, stored.blob) : undefined;
    queueImagePreview(storageKey);
    return undefined;
}

// 缩略图生成排成一队，避免一次打开大量图片时同时解码。
function queueImagePreview(storageKey: string) {
    previewQueue = previewQueue
        .then(async () => {
            const original = await getImageBlob(storageKey);
            if (original) await storeImagePreview(storageKey, original);
        })
        .catch(() => undefined);
}

async function storeImagePreview(storageKey: string, original: Blob) {
    const preview = await createImageThumbnail(original).catch(() => undefined);
    await previewStore.setItem<StoredImagePreview>(storageKey, { version: IMAGE_PREVIEW_VERSION, blob: preview }).catch(() => undefined);
    return preview ? cacheImagePreview(storageKey, preview) : undefined;
}

function cacheImagePreview(storageKey: string, preview: Blob) {
    const url = URL.createObjectURL(preview);
    previewUrls.set(storageKey, url);
    previewRevision += 1;
    previewListeners.forEach((listener) => listener());
    return url;
}

async function deleteImagePreview(storageKey: string) {
    const url = previewUrls.get(storageKey);
    if (url) URL.revokeObjectURL(url);
    previewUrls.delete(storageKey);
    await previewStore.removeItem(storageKey).catch(() => undefined);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    await deleteImagePreview(storageKey);
    await storeImagePreview(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url, options));
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await deleteImagePreview(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    const orphanPreviews: string[] = [];
    await previewStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) orphanPreviews.push(key);
    });
    await Promise.all([deleteStoredImages(unused), ...orphanPreviews.map(deleteImagePreview)]);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}

/** data URL 转 Blob。base64 走 atob 批量解码，避免大图逐字符拼字符串卡死主线程。 */
function dataUrlToBlob(dataUrl: string) {
    const match = /^data:([^,]*?),(.*)$/s.exec(dataUrl);
    if (!match) return Promise.reject(new Error(i18n.t("common.imageReadFailed")));
    const [, header = "", body = ""] = match;
    const mimeType = header.split(";")[0] || "application/octet-stream";
    if (!/;base64/i.test(header)) return Promise.resolve(new Blob([decodeURIComponent(body)], { type: mimeType }));
    const binary = atob(body.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return Promise.resolve(new Blob([bytes], { type: mimeType }));
}
