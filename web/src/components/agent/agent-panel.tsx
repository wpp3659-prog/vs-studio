import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";

import { LocalAgentPanel } from "./local-agent-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;
const FLOAT_MIN_WIDTH = 360;
const FLOAT_MIN_HEIGHT = 420;

export function AgentPanel() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelMode = useAgentStore((state) => state.panelMode);

    if (!panelMounted) return null;

    return panelMode === "float" ? <FloatPanel theme={theme} /> : <DockPanel theme={theme} />;
}

// 浮动模式：一张可拖动、可缩放的圆角卡片，浮在画布之上。
function FloatPanel({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const floatRect = useAgentStore((state) => state.floatRect);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const setFloatRect = useAgentStore((state) => state.setFloatRect);
    const [interacting, setInteracting] = useState(false);

    const startMove = (event: ReactPointerEvent<HTMLElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startRect = { ...floatRect };
        let next = startRect;
        const onMove = (moveEvent: PointerEvent) => {
            const x = startRect.x + moveEvent.clientX - startX;
            const y = startRect.y + moveEvent.clientY - startY;
            // 限制标题栏始终留在视口内，避免把面板拖到看不见的地方。
            next = {
                ...startRect,
                x: Math.min(Math.max(x, 8 - startRect.width + 96), window.innerWidth - 96),
                y: Math.min(Math.max(y, 0), window.innerHeight - 48),
            };
            setAgentState({ floatRect: next });
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setInteracting(false);
            setFloatRect(next);
        };
        setInteracting(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startRect = { ...floatRect };
        let next = startRect;
        const onMove = (moveEvent: PointerEvent) => {
            next = {
                ...startRect,
                width: Math.max(FLOAT_MIN_WIDTH, startRect.width + moveEvent.clientX - startX),
                height: Math.max(FLOAT_MIN_HEIGHT, startRect.height + moveEvent.clientY - startY),
            };
            setAgentState({ floatRect: next });
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setInteracting(false);
            setFloatRect(next);
        };
        setInteracting(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelOpen) return null;

    return (
        <motion.div
            className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border"
            data-canvas-shortcuts-ignore
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: panelClosing ? 0 : 1, scale: panelClosing ? 0.96 : 1 }}
            transition={{ duration: interacting ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{
                left: floatRect.x,
                top: floatRect.y,
                width: floatRect.width,
                height: floatRect.height,
                background: theme.node.panel,
                borderColor: theme.node.stroke,
                color: theme.node.text,
                boxShadow: "0 24px 60px rgba(15,23,42,.22)",
                pointerEvents: panelClosing ? "none" : undefined,
            }}
        >
            <button
                type="button"
                className="absolute bottom-0 right-0 z-50 size-4 cursor-nwse-resize"
                onPointerDown={startResize}
                aria-label="resize"
            />
            <LocalAgentPanel embedded dragHandle={{ onPointerDown: startMove, dragging: interacting }} />
        </motion.div>
    );
}

// 停靠模式：贴边显示，顶部把手可拖动面板，左边缘可调整宽度。
function DockPanel({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const width = useAgentStore((state) => state.width);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [dragging, setDragging] = useState(false);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

    const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startPos = { ...dragPos };
        const onMove = (moveEvent: PointerEvent) => {
            setDragPos({ x: startPos.x + moveEvent.clientX - startX, y: startPos.y + moveEvent.clientY - startY });
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setDragging(false);
        };
        setDragging(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setDragging(false);
        };
        setDragging(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    return (
        <motion.div
            className="relative z-[70] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: dragging ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: panelOpen && !panelClosing ? undefined : "none" }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col border-l"
                data-canvas-shortcuts-ignore
                initial={{ x: 48 }}
                animate={{ x: panelClosing ? 28 : 0 }}
                transition={{ duration: dragging ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    width,
                    background: theme.node.panel,
                    borderColor: theme.node.stroke,
                    color: theme.node.text,
                    transform: `translate(${dragPos.x}px, ${dragPos.y}px)`,
                }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label="resize" />
                <LocalAgentPanel embedded dragHandle={{ onPointerDown: startDrag, dragging }} />
            </motion.aside>
        </motion.div>
    );
}
