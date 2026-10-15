// 成片交付检查：项目内可勾选的广告/短片交付清单，记录备注并统计完成率。
import { definePlugin } from "@vs-studio/plugin-sdk";
import type { CanvasNodeContentProps } from "@vs-studio/plugin-sdk";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
type Check = { id: string; group: string; label: string; done: boolean; note: string };
const BASE: Omit<Check, "done" | "note">[] = [
    { id: "hook", group: "叙事与品牌", label: "开场钩子清楚，首屏/前 3 秒能抓住注意力" },
    { id: "message", group: "叙事与品牌", label: "核心信息单一明确，没有多卖点互相打架" },
    { id: "brand", group: "叙事与品牌", label: "品牌名、产品名与品牌露出时机正确" },
    { id: "cta", group: "叙事与品牌", label: "结尾 CTA、网址/二维码/活动时间等信息可读且准确" },
    { id: "story", group: "叙事与品牌", label: "情节、旁白、字幕与最终产品卖点一致" },
    { id: "identity", group: "画面与连续性", label: "人物身份、服装、发型、道具状态前后一致" },
    { id: "axis", group: "画面与连续性", label: "轴线、屏幕方向、视线匹配与动作接点已复查" },
    { id: "light", group: "画面与连续性", label: "同场景光线方向、时间与色彩连续" },
    { id: "crop", group: "画面与连续性", label: "各平台画幅裁切已检查，主体没有被切掉" },
    { id: "safe", group: "画面与连续性", label: "字幕、Logo、二维码处于目标平台安全区" },
    { id: "flicker", group: "画面与连续性", label: "闪烁、黑帧、坏帧、AI 变形与不自然运动已检查" },
    { id: "grade", group: "画面与连续性", label: "曝光、白平衡、肤色和全片调色统一" },
    { id: "dialogue", group: "声音", label: "对白/旁白清晰，齿音、爆音、底噪已检查" },
    { id: "mix", group: "声音", label: "对白、音乐、音效的响度层级合适，关键字不被盖住" },
    { id: "peak", group: "声音", label: "峰值与响度符合投放/平台交付规范" },
    { id: "sync", group: "声音", label: "口型、动作、音效与画面同步，结尾无突兀截断" },
    { id: "subs", group: "文字与合规", label: "字幕逐字校对，错别字、人名、品牌拼写和标点正确" },
    { id: "read", group: "文字与合规", label: "字幕字号、对比度、断行和停留时间易读" },
    { id: "claims", group: "文字与合规", label: "功效、数据、价格、对比表述有依据并经授权审核" },
    { id: "rights", group: "文字与合规", label: "音乐、字体、素材、肖像及商标授权已确认" },
    { id: "flash", group: "文字与合规", label: "频闪、敏感画面与平台内容规范已检查" },
    { id: "resolution", group: "导出与交付", label: "分辨率、帧率、画幅比例与编码符合交付要求" },
    { id: "version", group: "导出与交付", label: "文件名、版本号、语言版和平台版标记正确" },
    { id: "playback", group: "导出与交付", label: "导出文件从头到尾完整播放并在目标设备复核" },
    { id: "assets", group: "导出与交付", label: "成片、封面、字幕文件及项目归档包齐全" },
];
function readChecks(raw: unknown): Check[] {
    const saved = Array.isArray(raw) ? raw as Partial<Check>[] : [];
    return BASE.map((base) => { const old = saved.find((x) => x.id === base.id); return { ...base, done: Boolean(old?.done), note: String(old?.note || "") }; });
}
function report(checks: Check[], target: string) {
    const total = checks.filter((x) => x.done).length;
    return [`交付目标：${target}`, `完成：${total}/${checks.length}（${Math.round(total / checks.length * 100)}%）`, ...checks.map((x) => `${x.done ? "[完成]" : "[待检查]"} ${x.group}｜${x.label}${x.note ? `｜备注：${x.note}` : ""}`)].join("\n");
}
function DeliveryQcContent({ ctx }: CanvasNodeContentProps) {
    const checks = readChecks(ctx.node.metadata?.checks);
    const target = (ctx.node.metadata?.target as string | undefined) || "TVC / 短片通用";
    const done = checks.filter((x) => x.done).length;
    const groups = [...new Set(BASE.map((x) => x.group))];
    const save = (next: Check[]) => ctx.updateMetadata({ checks: next });
    const control = { padding: "4px 7px", borderRadius: 7, border: `1px solid ${ctx.theme.node.stroke}`, background: ctx.theme.toolbar.panel, color: ctx.theme.node.text, fontSize: 11 } as const;
    const btn = { ...control, cursor: "pointer", padding: "4px 9px" } as const;
    return <div data-canvas-no-zoom onMouseDown={stop} onWheel={stop} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 7, padding: 11, boxSizing: "border-box", background: ctx.theme.node.fill, borderRadius: 16, color: ctx.theme.node.text, minHeight: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, flexShrink: 0 }}><span style={{ fontSize: 11 }}>交付目标</span><select value={target} onChange={(e) => ctx.updateMetadata({ target: e.target.value })} style={control}>{["TVC / 短片通用", "9:16 竖屏短视频", "16:9 横屏视频", "2.39:1 宽银幕", "1:1 / 4:5 社媒", "自定义交付"].map((x) => <option key={x}>{x}</option>)}</select><b style={{ marginLeft: "auto", fontSize: 12 }}>{done}/{checks.length} · {Math.round(done / checks.length * 100)}%</b><button style={btn} onClick={() => save(checks.map((x) => ({ ...x, done: false })))}>全部重置</button></div>
        <div style={{ height: 5, background: ctx.theme.node.stroke, borderRadius: 99, flexShrink: 0 }}><div style={{ width: `${done / checks.length * 100}%`, height: "100%", background: "#22c55e", borderRadius: 99 }} /></div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{groups.map((group) => <section key={group} style={{ marginBottom: 8 }}><div style={{ position: "sticky", top: 0, zIndex: 1, padding: "4px 6px", background: ctx.theme.toolbar.panel, fontSize: 11.5, fontWeight: 700 }}>{group}</div>{checks.filter((x) => x.group === group).map((x) => <div key={x.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "5px 4px", borderBottom: `1px solid ${ctx.theme.node.stroke}` }}><input type="checkbox" checked={x.done} onChange={(e) => save(checks.map((c) => c.id === x.id ? { ...c, done: e.target.checked } : c))} style={{ marginTop: 2 }} /><span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.45, opacity: x.done ? .65 : 1, textDecoration: x.done ? "line-through" : "none" }}>{x.label}</span><input aria-label="检查备注" value={x.note} placeholder="备注" onChange={(e) => save(checks.map((c) => c.id === x.id ? { ...c, note: e.target.value } : c))} onWheel={stop} style={{ ...control, width: 92 }} /></div>)}</section>)}</div>
        <div style={{ flexShrink: 0, fontSize: 10, opacity: .65 }}>本清单是内部复核辅助；平台规格、法律授权及客户审片要求仍以项目正式规范为准。</div>
    </div>;
}
export default definePlugin({ id: "delivery-qc", name: "成片交付检查表", version: "1.0.0", description: "24 项可勾选的影视/TVC 交付复核清单，含叙事品牌、画面连续性、声音、字幕合规与文件导出", nodes: [{ type: "delivery-qc:checklist", title: "交付检查", icon: "✅", description: "成片交付检查表：分组勾选、备注与完成度统计", defaultSize: { width: 500, height: 550 }, defaultMetadata: { target: "TVC / 短片通用", checks: BASE.map((x) => ({ ...x, done: false, note: "" })) }, minimapColor: "#22c55e", hidePanel: true, interactionToggle: true, resource: (node) => ({ kind: "text", text: report(readChecks(node.metadata?.checks), String(node.metadata?.target || "TVC / 短片通用")) }), Content: DeliveryQcContent }] });
