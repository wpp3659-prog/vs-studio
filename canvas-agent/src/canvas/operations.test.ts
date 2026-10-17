import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanvasToolRequest } from "./operations.js";

function opsOf(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>) {
    const request = buildCanvasToolRequest(name, input, null);
    return (request.input as { ops: Array<Record<string, any>> }).ops;
}

test("generation flow reuses referenced nodes when the prompt only mentions them", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "@[node:text-1]", referenceNodeIds: ["text-1"], title: "Flow", autoRun: true });
    const addedTextNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(addedTextNodes.length, 0);
    assert.equal(ops.filter((op) => op.type === "connect_nodes" && op.fromNodeId === "text-1" && String(op.toNodeId).startsWith("config-")).length, 1);
    assert.match(String(config?.metadata?.prompt), /^@\[node:text-1\]$/);
    assert.equal(runs.length, 1);
});

test("generation flow still creates a prompt node for prose prompts", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a cat on a roof", referenceNodeIds: ["text-1"], autoRun: true });
    assert.equal(ops.filter((op) => op.type === "add_node" && op.nodeType === "text").length, 1);
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.match(String(config?.metadata?.prompt), /@\[node:text-/);
});

const shots = [
    { no: "01", shotSize: "远景", cameraMove: "推镜", duration: "3s", action: "雪原上的孤城", dialogue: "旁白：天要亮了" },
    { no: "02", shotSize: "中景", action: "少女推门而出" },
    { no: "03", shotSize: "特写", action: "刀刃反光", prompt: "刀刃上反射出火把" },
];

test("storyboard lays out one setting node plus a card and config per shot", () => {
    const ops = opsOf("canvas_create_storyboard", { title: "第一场", style: "冷色调武侠", aspect: "16:9", shots });
    const textNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const configNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "config");
    assert.equal(textNodes.length, 4);
    assert.equal(configNodes.length, 3);
    assert.equal(ops.filter((op) => op.type === "connect_nodes").length, 6);
    assert.equal(ops.filter((op) => op.type === "run_generation").length, 0);
    assert.equal(new Set(textNodes.map((op) => op.position.x)).size, 3);
    assert.match(String(textNodes[0].metadata.content), /风格：冷色调武侠/);
    assert.match(String(textNodes[1].metadata.content), /镜头 01｜远景｜推镜｜3s/);
    assert.match(String(configNodes[0].metadata.prompt), /@\[node:text-/);
    assert.equal(configNodes[0].metadata.size, "16:9");
});

test("storyboard runs every shot when autoRun is set", () => {
    const ops = opsOf("canvas_create_storyboard", { shots, autoRun: true });
    const configIds = ops.filter((op) => op.type === "add_node" && op.nodeType === "config").map((op) => op.id);
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(runs.length, 3);
    assert.deepEqual(runs.map((op) => op.nodeId), configIds);
});
