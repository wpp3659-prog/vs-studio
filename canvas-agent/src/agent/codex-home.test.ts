import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AGENT_CODEX_HOME, syncAgentCodexHome, USER_CODEX_HOME } from "./codex-home.js";

function makeTempHome() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-test-"));
    return home;
}

// These tests exercise the managed-block logic against a temp CODEX_HOME.
// The module captures USER_CODEX_HOME at import time, so we test the pure
// block construction by writing a fake user config and re-importing is not
// possible; instead we assert on the real behavior via the exported sync fn
// using the actual user home (read-only). Keep assertions structural.

test("syncAgentCodexHome creates the agent home directory", () => {
    const result = syncAgentCodexHome(null);
    assert.ok(fs.existsSync(result.home));
    assert.ok(path.isAbsolute(result.home));
});

test("syncAgentCodexHome without a channel never writes a managed provider block", () => {
    const result = syncAgentCodexHome(null);
    const text = fs.readFileSync(path.join(result.home, "config.toml"), "utf8");
    assert.equal(text.includes("vs-studio agent provider"), false);
    assert.equal(result.hasChannel, false);
});

test("syncAgentCodexHome with a channel writes provider with bearer token", () => {
    const result = syncAgentCodexHome({ name: "测试渠道", baseUrl: "https://example.com/", apiKey: "sk-abc", apiFormat: "openai", model: "gpt-6.1-sol" });
    const text = fs.readFileSync(path.join(result.home, "config.toml"), "utf8");
    assert.ok(text.includes("vs-studio agent provider"));
    assert.ok(text.includes('model_provider = "canvas_agent"'));
    assert.ok(text.includes('model = "gpt-6.1-sol"'));
    assert.ok(text.includes('base_url = "https://example.com"'));
    assert.ok(text.includes('experimental_bearer_token = "sk-abc"'));
    assert.equal(result.hasChannel, true);
});

test("syncAgentCodexHome replaces rather than stacks managed blocks", () => {
    syncAgentCodexHome({ name: "A", baseUrl: "https://a.test", apiKey: "sk-a", apiFormat: "openai", model: "model-a" });
    const result = syncAgentCodexHome({ name: "B", baseUrl: "https://b.test", apiKey: "sk-b", apiFormat: "openai", model: "model-b" });
    const text = fs.readFileSync(path.join(result.home, "config.toml"), "utf8");
    assert.equal(text.split("vs-studio agent provider").length - 1, 2);
    assert.equal(text.includes("model-a"), false);
    assert.ok(text.includes('model = "model-b"'));
    assert.ok(text.includes('base_url = "https://b.test"'));
});

test("syncAgentCodexHome drops the channel block when channel becomes null", () => {
    syncAgentCodexHome({ name: "A", baseUrl: "https://a.test", apiKey: "sk-a", apiFormat: "openai", model: "model-a" });
    const result = syncAgentCodexHome(null);
    const text = fs.readFileSync(path.join(result.home, "config.toml"), "utf8");
    assert.equal(text.includes("model-a"), false);
    assert.equal(text.includes("vs-studio agent provider"), false);
    assert.equal(result.hasChannel, false);
});

test("syncAgentCodexHome never inherits the user's daily model provider", () => {
    syncAgentCodexHome(null);
    const text = fs.readFileSync(path.join(AGENT_CODEX_HOME, "config.toml"), "utf8");
    // 顶层模型/渠道设置必须被剔除，否则没有画布渠道时会回落到日常渠道。
    const topLevel = text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("[") && /^\s*(model_provider|model|model_reasoning_effort)\s*=/.test(line));
    assert.deepEqual(topLevel, []);
});

test("syncAgentCodexHome keeps plugins and MCP from the user config", () => {
    const result = syncAgentCodexHome(null);
    const text = fs.readFileSync(path.join(result.home, "config.toml"), "utf8");
    // 用户配置里没有这些段时同样合法；有则必须保留。
    const userText = fs.existsSync(path.join(USER_CODEX_HOME, "config.toml")) ? fs.readFileSync(path.join(USER_CODEX_HOME, "config.toml"), "utf8") : "";
    if (userText.includes("[mcp_servers")) assert.ok(text.includes("[mcp_servers"));
    if (userText.includes("[plugins.")) assert.ok(text.includes("[plugins."));
});
