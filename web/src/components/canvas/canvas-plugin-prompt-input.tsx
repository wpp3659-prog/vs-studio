import { useMemo } from "react";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { CanvasPluginPromptInputOptions } from "@/types/canvas-plugin";
import { buildNodeMentionReferences } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";

type Props = CanvasPluginPromptInputOptions & {
    nodeId: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    onDisconnectReference: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection: (nodeId: string) => void;
};

export function CanvasPluginPromptInput({ nodeId, nodes, connections, onDisconnectReference, onStartReferenceSelection, value, onChange, placeholder, className, containerClassName, style, onSubmit, referenceTokenMode = false }: Props) {
    const node = nodes.find((item) => item.id === nodeId);
    const connectedNodes = useMemo(() => connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => nodes.find((item) => item.id === connection.fromNodeId)).filter((item): item is CanvasNodeData => Boolean(item)), [connections, nodeId, nodes]);
    const references = useMemo(() => node ? buildNodeMentionReferences(node, nodes, connections) : [], [connections, node, nodes]);

    return (
        <div className={containerClassName}>
            <CanvasNodeReferenceBar nodeId={nodeId} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onStartSelection={onStartReferenceSelection} />
            <CanvasPromptChipInput value={value} references={references} onChange={onChange} onSubmit={onSubmit} placeholder={placeholder} className={className} style={style} referenceTokenMode={referenceTokenMode} />
        </div>
    );
}
