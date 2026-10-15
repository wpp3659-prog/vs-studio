import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CONFIG_DIR } from "../config.js";
import { logger } from "../utils/logger.js";

/** 画布 Agent 专用的 Codex 配置目录，与用户日常使用的 ~/.codex 完全隔离。 */
export const AGENT_CODEX_HOME = path.join(CONFIG_DIR, "agent-config");
/** 用户日常 Codex 配置目录，只读来源。 */
export const USER_CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");

export type AgentChannelModel = { name: string; baseUrl: string; apiKey: string; apiFormat: string; model: string };

const CONFIG_FILE = "config.toml";
const BLOCK_START = "# >>> vs-studio agent provider >>>";
const BLOCK_END = "# <<< vs-studio agent provider <<<";
// 品牌改名前的旧区块标记。用户 config.toml 里可能还留着旧区块，
// 只认新标记会导致旧区块被当成用户内容残留、下一轮再追加一份。读到就一起清掉。
const LEGACY_BLOCK_START = "# >>> infinite-canvas agent provider >>>";
const LEGACY_BLOCK_END = "# <<< infinite-canvas agent provider <<<";

/** 读取用户原始 config.toml；不存在时返回空字符串。 */
function readUserConfig(): string {
    try {
        return fs.readFileSync(path.join(USER_CODEX_HOME, CONFIG_FILE), "utf8");
    } catch {
        return "";
    }
}

/** 移除上一轮由画布写入的托管区块，保留用户其余原始内容。 */
function stripManagedBlock(text: string) {
    return stripOneBlock(stripOneBlock(text, LEGACY_BLOCK_START, LEGACY_BLOCK_END), BLOCK_START, BLOCK_END);
}

/** 按给定起止标记删掉一段托管区块；标记缺失时原样返回。 */
function stripOneBlock(text: string, startMark: string, endMark: string) {
    const start = text.indexOf(startMark);
    if (start < 0) return text;
    const end = text.indexOf(endMark);
    if (end < 0) return text.slice(0, start).trimEnd();
    return `${text.slice(0, start)}${text.slice(end + endMark.length)}`.trimEnd();
}

/** 移除顶层 `model_provider` / `model` / `model_reasoning_effort`，避免与画布渠道冲突。 */
function stripTopLevelModelKeys(text: string) {
    const lines = text.split("\n");
    const output: string[] = [];
    let inTable = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("[")) inTable = true;
        if (!inTable && /^(model_provider|model|model_reasoning_effort)\s*=/.test(trimmed)) continue;
        output.push(line);
    }
    return output.join("\n");
}

/** 生成画布渠道对应的 provider 区块；渠道为空时返回空字符串。 */
function buildManagedBlock(channel: AgentChannelModel | null) {
    if (!channel?.model) return "";
    // 渠道名做 TOML 键时只保留字母数字，避免中文或特殊字符导致解析失败。
    const key = `canvas_${channel.model.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const wireApi = channel.apiFormat === "gemini" ? "chat" : "responses";
    return [
        BLOCK_START,
        'model_provider = "canvas_agent"',
        `model = ${JSON.stringify(channel.model)}`,
        "",
        "[model_providers.canvas_agent]",
        `name = ${JSON.stringify(channel.name || key)}`,
        `base_url = ${JSON.stringify(channel.baseUrl.replace(/\/+$/, ""))}`,
        `wire_api = ${JSON.stringify(wireApi)}`,
        "requires_openai_auth = false",
        `experimental_bearer_token = ${JSON.stringify(channel.apiKey)}`,
        BLOCK_END,
    ].join("\n");
}

/** 把用户 config.toml 复制到隔离目录并替换渠道区块，返回是否写入了渠道。 */
export function syncAgentCodexHome(channel: AgentChannelModel | null): { home: string; hasChannel: boolean } {
    fs.mkdirSync(AGENT_CODEX_HOME, { recursive: true });
    // 保留用户的 plugins / MCP / marketplaces 等能力，但剔除顶层的模型与渠道设置，
    // 避免画布 Agent 在没有配置画布渠道时回落到用户日常使用的渠道。
    const base = stripTopLevelModelKeys(stripManagedBlock(readUserConfig()));
    const block = buildManagedBlock(channel);
    const content = block ? `${block}\n\n${base}`.trimEnd() + "\n" : `${base.trimEnd()}\n`;
    fs.writeFileSync(path.join(AGENT_CODEX_HOME, CONFIG_FILE), content, { mode: 0o600 });
    // 登录态跟随复制；用户当前用渠道密钥时该文件不存在，跳过即可。
    copyIfPresent("auth.json");
    copyIfPresent("AGENTS.md");
    logger.info("Synced agent Codex home", { home: AGENT_CODEX_HOME, hasChannel: Boolean(block), from: USER_CODEX_HOME });
    return { home: AGENT_CODEX_HOME, hasChannel: Boolean(block) };
}

/** 复制用户 Codex 目录下的同名文件；目标已存在且内容相同则跳过。 */
function copyIfPresent(name: string) {
    const from = path.join(USER_CODEX_HOME, name);
    if (!fs.existsSync(from)) return;
    const to = path.join(AGENT_CODEX_HOME, name);
    try {
        fs.copyFileSync(from, to);
    } catch (error) {
        logger.warn("Failed to copy Codex file into agent home", { name, error: error instanceof Error ? error.message : String(error) });
    }
}

/** 隔离目录是否已经准备好（含 config.toml）。 */
export function agentCodexHomeReady() {
    return fs.existsSync(path.join(AGENT_CODEX_HOME, CONFIG_FILE));
}
