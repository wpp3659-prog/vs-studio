import { useEffect, useState } from "react";
import { Button, Modal, Segmented, Slider } from "antd";
import { Grid3x3, RotateCcw, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/** 角度矩阵布局：矩阵模式下一次直出多张不同机位的图 */
export type CanvasAngleMatrixLayout = "three" | "nine" | "twelve";

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
    /** 角度矩阵布局；不填为单角度 */
    matrix?: CanvasAngleMatrixLayout;
};

const defaultParams: CanvasImageAngleParams = {
    horizontalAngle: 0,
    pitchAngle: 9,
    cameraDistance: 4.8,
    wideAngle: false,
};

export const ANGLE_MATRIX_LAYOUTS: Record<CanvasAngleMatrixLayout, { views: number; columns: number }> = {
    three: { views: 3, columns: 3 },
    nine: { views: 9, columns: 3 },
    twelve: { views: 12, columns: 4 },
};

/** 生成矩阵里每个机位的角度参数：先绕一圈水平，再按圈分层俯仰 */
export function buildAngleMatrix(params: CanvasImageAngleParams): CanvasImageAngleParams[] {
    const layout = params.matrix;
    if (!layout) return [params];
    const { views } = ANGLE_MATRIX_LAYOUTS[layout];
    const base = { cameraDistance: params.cameraDistance, wideAngle: params.wideAngle };
    if (layout === "three") {
        return [
            { ...base, horizontalAngle: -40, pitchAngle: 6 },
            { ...base, horizontalAngle: 0, pitchAngle: 6 },
            { ...base, horizontalAngle: 40, pitchAngle: 6 },
        ];
    }
    const ring = layout === "twelve" ? 8 : 6;
    const pitches = layout === "twelve" ? [24, -8, 0, 30] : [24, 4, -18];
    return Array.from({ length: views }, (_, index) => {
        const level = Math.floor(index / ring);
        const slot = index % ring;
        return {
            ...base,
            horizontalAngle: Math.round((360 / ring) * slot),
            pitchAngle: pitches[level] ?? params.pitchAngle,
        };
    });
}

export function CanvasNodeAngleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void }) {
    const { t } = useTranslation();
    const [params, setParams] = useState(defaultParams);

    useEffect(() => {
        if (open) setParams(defaultParams);
    }, [dataUrl, open]);

    const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value }));

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">{t("canvas.editors.angleTitle")}</h2>
                    <p className="mt-1 text-sm opacity-60">{t("canvas.editors.angleDescription")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
                    <Segmented
                        value={params.matrix || "single"}
                        options={[
                            { label: t("canvas.editors.angleSingle"), value: "single" },
                            { label: t("canvas.editors.angleThree"), value: "three" },
                            { label: t("canvas.editors.angleNine"), value: "nine" },
                            { label: t("canvas.editors.angleTwelve"), value: "twelve" },
                        ]}
                        onChange={(value) => update("matrix", value === "single" ? undefined : (value as CanvasAngleMatrixLayout))}
                    />
                    <span className="text-xs opacity-55">{params.matrix ? t("canvas.editors.angleMatrixHint", { count: ANGLE_MATRIX_LAYOUTS[params.matrix].views }) : t("canvas.editors.angleSingleHint")}</span>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="flex min-h-[300px] flex-col justify-between rounded-xl border p-4">
                        <div className="grid flex-1 place-items-center">
                            {params.matrix ? (
                                <div className="grid w-full max-w-[280px] gap-2" style={{ gridTemplateColumns: `repeat(${ANGLE_MATRIX_LAYOUTS[params.matrix].columns}, minmax(0, 1fr))` }}>
                                    {buildAngleMatrix(params).map((view, index) => (
                                        <div key={index} className="relative aspect-square overflow-hidden rounded-md border bg-black/5">
                                            <img src={dataUrl} alt="" className="size-full object-cover opacity-90" draggable={false} style={{ transform: previewTransform(view) }} />
                                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1 text-[10px] leading-4 text-white">{view.horizontalAngle}°</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="relative">
                                    <img src={dataUrl} alt="" className="size-48 rounded-2xl object-cover shadow-2xl" draggable={false} style={{ transform: previewTransform(params) }} />
                                    <div className="absolute -bottom-6 left-1/2 h-10 w-24 -translate-x-1/2 rounded-full border bg-black/20 backdrop-blur" />
                                </div>
                            )}
                        </div>
                        <Button className="w-fit" icon={<RotateCcw className="size-4" />} onClick={() => setParams({ ...defaultParams, matrix: params.matrix })}>
                            {t("canvas.editors.reset")}
                        </Button>
                    </div>
                    <div className="space-y-6 py-2">
                        {!params.matrix ? <AngleSlider label={t("canvas.editors.horizontal")} value={params.horizontalAngle} min={-60} max={60} step={1} suffix="deg" onChange={(value) => update("horizontalAngle", value)} /> : null}
                        {!params.matrix ? <AngleSlider label={t("canvas.editors.pitch")} value={params.pitchAngle} min={-45} max={45} step={1} suffix="deg" onChange={(value) => update("pitchAngle", value)} /> : null}
                        <AngleSlider label={t("canvas.editors.distance")} value={params.cameraDistance} min={1} max={10} step={0.1} onChange={(value) => update("cameraDistance", value)} />
                        <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
                            <span className="font-medium opacity-75">{t("canvas.editors.lens")}</span>
                            <Segmented
                                className="w-fit"
                                value={params.wideAngle ? "wide" : "standard"}
                                options={[
                                    { label: t("canvas.editors.standard"), value: "standard" },
                                    { label: t("canvas.editors.wide"), value: "wide" },
                                ]}
                                onChange={(value) => update("wideAngle", value === "wide")}
                            />
                        </div>
                        {params.matrix ? <p className="rounded-lg bg-black/5 px-3 py-2 text-xs leading-5 opacity-60">{t("canvas.editors.angleMatrixNote")}</p> : null}
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={params.matrix ? <Grid3x3 className="size-4" /> : <WandSparkles className="size-4" />} onClick={() => onConfirm(params)}>
                        {params.matrix ? t("canvas.editors.angleGenerateMatrix", { count: ANGLE_MATRIX_LAYOUTS[params.matrix].views }) : t("canvas.editors.aiGenerate")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function AngleSlider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
            <span className="font-medium opacity-75">{label}</span>
            <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
            <span className="whitespace-nowrap text-right font-semibold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {suffix}
            </span>
        </div>
    );
}

function previewTransform(params: CanvasImageAngleParams) {
    const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
    return `perspective(520px) rotateY(${params.horizontalAngle * -0.45}deg) rotateX(${params.pitchAngle * 0.35}deg) scale(${Math.max(0.72, Math.min(1.08, scale))})`;
}
