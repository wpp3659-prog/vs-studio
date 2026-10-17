import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { buildCapCutTimeline, buildDraftContent, buildDraftMetaInfo, orderTimelineNodes } from "@/lib/canvas/capcut-draft";
import { buildDeliveryPackage, buildDeliveryReadme, buildShotsCsv, buildShotsJson, buildSrt, buildVoiceoverScript } from "@/lib/canvas/delivery-package";
import type { CanvasExportAsset, CanvasExportFile } from "@/types/canvas-export";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export async function exportCanvasProjects(projects: CanvasProject[], fileName = i18n.t("canvas.export.defaultProjectName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectStorageKeys(project).map(async (storageKey) => {
                    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "vs-studio", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    await Promise.all(
        nodes.map(async (node) => {
            const title = node.title || node.type;
            const storageKey = node.metadata?.storageKey || "";
            if (storageKey) {
                const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                if (blob) return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            if (node.type === CanvasNodeType.Text) return void zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" });
            const content = node.metadata?.content;
            if (content && content.startsWith("data:")) {
                const blob = await (await fetch(content)).blob();
                return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
        }),
    );

    const zip = await createZip(zipFiles);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

/**
 * 导出剪映草稿：把画布上有内容的镜头按顺序排成时间线，连同素材文件一起打成 zip。
 * 用户在剪映里「导入草稿 / 打开草稿文件夹」指向解压目录即可继续精剪。
 */
export async function exportCapCutDraft(nodes: CanvasNodeData[], connections: CanvasConnection[] = [], fileName = i18n.t("canvas.capcut.defaultTitle")) {
    const title = safeFileName(fileName) || i18n.t("canvas.capcut.defaultTitle");
    const timeline = buildCapCutTimeline(nodes, connections, { title });
    if (!timeline.clips.length) throw new Error(i18n.t("canvas.capcut.empty"));

    const playable = nodes.filter((node) => (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.storageKey && node.metadata.status !== "error");
    // 素材编号必须和时间线的镜头顺序完全一致，否则画面会和名字错位。
    const orderedMain = orderTimelineNodes(playable, connections);
    const orderedAudio = nodes.filter((node) => node.type === CanvasNodeType.Audio && node.metadata?.storageKey);
    const sourceNodes = [...orderedMain, ...orderedAudio];

    const files: { name: string; data: BlobPart }[] = [];
    await Promise.all(
        timeline.clips.map(async (clip, index) => {
            const node = sourceNodes[index];
            if (!node) return;
            const storageKey = node.metadata?.storageKey || "";
            if (!storageKey) return;
            const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) return;
            // 扩展名以实际字节为准：上游给的 mime 有时和真实格式不一致，写错剪映会拒收。
            const extension = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : blob.type.includes("wav") ? "wav" : blob.type.includes("mpeg") || blob.type.includes("mp3") ? "mp3" : clip.kind === "video" ? "mp4" : "png";
            files.push({ name: `${title}/${clip.fileName.replace(/\.(png|mp4|mp3|jpg|webp|webm|wav)$/, `.${extension}`)}`, data: blob });
        }),
    );
    const meta = buildDraftMetaInfo(timeline);
    files.push({ name: `${title}/draft_content.json`, data: JSON.stringify(buildDraftContent(timeline), null, 2) });
    files.push({ name: `${title}/draft_meta_info.json`, data: JSON.stringify(meta, null, 2) });
    // 剪映 5.x 以上还会读这个文件判断草稿根目录，缺了会提示「草稿已损坏」。
    files.push({ name: `${title}/draft_agency_config.json`, data: JSON.stringify({ is_use_additional_effect: false, intelligent_agency: false }, null, 2) });
    files.push({ name: `${title}/README.txt`, data: i18n.t("canvas.capcut.readme", { title }) });

    const zip = await createZip(files);
    saveAs(zip, `${title}-${i18n.t("canvas.capcut.fileSuffix")}.zip`);
}
/**
 * 导出成片交付包：镜头表 + 素材 + 配音稿 + 字幕，打成 zip 直接发给甲方/后期。
 * 与剪映草稿的区别：交付包是「给人看和交接」的，剪映草稿是「给软件打开」的，两者都提供。
 */
export async function exportDeliveryPackage(nodes: CanvasNodeData[], connections: CanvasConnection[] = [], fileName = i18n.t("canvas.delivery.defaultTitle")) {
    const title = safeFileName(fileName) || i18n.t("canvas.delivery.defaultTitle");
    const pkg = buildDeliveryPackage(nodes, connections, { title });
    if (!pkg.shots.length) throw new Error(i18n.t("canvas.delivery.empty"));

    const files: { name: string; data: BlobPart }[] = [];
    // 素材文件名来自镜头表里的 fileName，两处必须一一对应，所以直接用 pkg 里的名字取节点。
    const byNodeId = new Map(nodes.map((node) => [node.id, node]));
    await Promise.all(
        pkg.shots.map(async (shot) => {
            const node = byNodeId.get(shot.nodeId);
            const storageKey = node?.metadata?.storageKey || "";
            if (!storageKey) return;
            const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) return;
            // 扩展名以真实字节为准，镜头表里写的是一个格式、盘上是另一个的话剪映/剪辑软件会打不开。
            const extension = blobExtension(blob.type, shot.kind);
            files.push({ name: `${title}/${shot.fileName.replace(/\.[^.]+$/, `.${extension}`)}`, data: blob });
        }),
    );
    // 音频素材跟着镜头表一起交付，命名规则与剪映草稿一致。
    await Promise.all(
        pkg.audios.map(async (clip) => {
            const node = nodes.find((item) => item.type === CanvasNodeType.Audio && item.metadata?.storageKey && clip.name === (item.title || ""));
            const storageKey = node?.metadata?.storageKey || "";
            if (!storageKey) return;
            const blob = await getMediaBlob(storageKey);
            if (!blob) return;
            files.push({ name: `${title}/${clip.fileName.replace(/\.[^.]+$/, `.${blobExtension(blob.type, "audio")}`)}`, data: blob });
        }),
    );

    files.push({ name: `${title}/shots.csv`, data: buildShotsCsv(pkg) });
    files.push({ name: `${title}/shots.json`, data: buildShotsJson(pkg) });
    files.push({ name: `${title}/README.txt`, data: buildDeliveryReadme(pkg) });
    const voiceover = buildVoiceoverScript(pkg);
    if (voiceover) files.push({ name: `${title}/voiceover.txt`, data: voiceover });
    const srt = buildSrt(pkg);
    if (srt) files.push({ name: `${title}/subtitles.srt`, data: srt });

    const zip = await createZip(files);
    saveAs(zip, `${title}-${i18n.t("canvas.delivery.fileSuffix")}.zip`);
    return pkg;
}

function blobExtension(mimeType: string, kind: "image" | "video" | "audio") {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("ogg")) return "ogg";
    return kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3";
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
