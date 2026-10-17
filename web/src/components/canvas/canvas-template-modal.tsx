import { useEffect, useState } from "react";
import { Button, Empty, Input, Modal, Popconfirm } from "antd";
import { useTranslation } from "react-i18next";

import { deleteCanvasTemplate, listCanvasTemplates, saveCanvasTemplate } from "@/services/canvas-templates";
import type { CanvasTemplate } from "@/lib/canvas/canvas-templates";

export function CanvasTemplateModal({
    open,
    selectionCount,
    initialName,
    onClose,
    onSave,
    onInsert,
}: {
    open: boolean;
    selectionCount: number;
    initialName: string;
    onClose: () => void;
    onSave: (name: string) => CanvasTemplate | null;
    onInsert: (template: CanvasTemplate) => void;
}) {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
    const [name, setName] = useState(initialName);

    useEffect(() => {
        if (!open) return;
        setName(initialName);
        void listCanvasTemplates().then(setTemplates);
    }, [open, initialName]);

    const save = async () => {
        const template = onSave(name);
        if (!template) return;
        setTemplates(await saveCanvasTemplate(template));
        setName("");
    };

    const remove = async (id: string) => {
        setTemplates(await deleteCanvasTemplate(id));
    };

    return (
        <Modal title={t("canvas.template.title")} open={open} centered width={560} onCancel={onClose} footer={null} destroyOnHidden>
            <p className="mb-2 text-sm text-stone-500">{selectionCount > 0 ? t("canvas.template.hint", { count: selectionCount }) : t("canvas.template.noSelection")}</p>
            <div className="mb-4 flex gap-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("canvas.template.namePlaceholder")} onPressEnter={() => void save()} />
                <Button type="primary" disabled={selectionCount === 0} onClick={() => void save()}>
                    {t("canvas.template.save")}
                </Button>
            </div>
            {templates.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.template.empty")} />
            ) : (
                <div className="max-h-[46vh] overflow-y-auto">
                    {templates.map((template) => (
                        <div key={template.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-2.5 first:border-t-0 dark:border-white/10">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{template.name}</div>
                                <div className="text-xs text-stone-400">{t("canvas.template.nodeCount", { nodes: template.nodes.length, connections: template.connections.length })}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button size="small" type="text" onClick={() => onInsert(template)}>
                                    {t("canvas.template.insert")}
                                </Button>
                                <Popconfirm title={t("canvas.template.deleteTitle")} onConfirm={() => void remove(template.id)}>
                                    <Button size="small" type="text" danger>
                                        {t("canvas.template.delete")}
                                    </Button>
                                </Popconfirm>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
}
