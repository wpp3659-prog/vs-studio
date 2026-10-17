import type { ReferenceImage } from "@/types/image";

import i18n from "@/i18n";

/** 主体（角色 / 场景 / 道具）参考图：命中后额外追加一致性要求 */
export type SubjectReferenceHint = { index: number; role: "character" | "scene" | "prop"; title: string };

export function imageReferenceLabel(index: number) {
    return i18n.t("imageReferences.label", { index: index + 1 });
}

export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[], subjects: SubjectReferenceHint[] = []) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((_, index) => imageReferenceLabel(index));
    const prefix = i18n.t("imageReferences.promptPrefix", { labels: labels.join(i18n.t("imageReferences.separator")), prompt: text });
    if (!subjects.length) return prefix;
    // 主体一致性：换镜头时最容易丢的是脸和场景,这里把「保持谁」说清楚
    const lines = subjects.map((subject) => i18n.t("imageReferences.subjectLine", { label: imageReferenceLabel(subject.index), role: i18n.t(`imageReferences.subjectRoles.${subject.role}`), title: subject.title }));
    return `${prefix}\n\n${i18n.t("imageReferences.subjectPrefix", { lines: lines.join("\n") })}`;
}
