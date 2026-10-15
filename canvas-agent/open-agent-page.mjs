// 本地版便利脚本：等待 canvas-agent 就绪后，用带连接参数的方式打开画布页面，
// 免去用户手动复制 Connect token。仅在本地源码运行（启动Agent-本地版.bat）时使用。
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const configPath = path.join(os.homedir(), ".infinite-canvas", "canvas-agent.json");
// 画布前端 dev server 地址；可由环境变量覆盖。
const webUrl = (process.env.CANVAS_WEB_URL || "http://127.0.0.1:8760").replace(/\/$/, "");
const readyUrl = (process.env.CANVAS_AGENT_READY_URL || "http://127.0.0.1:17371/health");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 读取本地 Agent 配置中的 token；文件未生成时返回空字符串。 */
function readToken() {
    try {
        const raw = JSON.parse(readFileSync(configPath, "utf8"));
        return typeof raw?.token === "string" ? raw.token.trim() : "";
    } catch {
        return "";
    }
}

/** 探测 Agent 是否已就绪。 */
async function agentReady() {
    try {
        const res = await fetch(readyUrl);
        return res.ok;
    } catch {
        return false;
    }
}

/** 探测画布前端是否已就绪，避免浏览器打开时页面还没起来。 */
async function webReady() {
    try {
        const res = await fetch(webUrl, { method: "HEAD" });
        return res.ok || res.status === 405;
    } catch {
        return false;
    }
}

async function waitFor(check, label, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return true;
        await sleep(1000);
    }
    console.log(`[open-agent-page] 等待 ${label} 超时，跳过自动打开浏览器。`);
    return false;
}

async function waitForToken(timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const token = readToken();
        if (token) return token;
        await sleep(500);
    }
    return "";
}

const [agentOk, webOk] = await Promise.all([
    waitFor(agentReady, "canvas-agent", 60_000),
    waitFor(webReady, "画布页面", 60_000),
]);
const token = agentOk ? await waitForToken(15_000) : "";
if (!agentOk || !webOk || !token) {
    console.log("[open-agent-page] 条件不满足，未自动打开浏览器：", { agentOk, webOk, hasToken: Boolean(token) });
    console.log(`[open-agent-page] 可手动打开 ${webUrl} 并填入 Connect token。`);
    process.exit(0);
}

// token 放在 hash 里，不会进入服务器日志和 Referer；前端读取后立即从地址栏移除。
// Windows 下用 `start` 打开：URL 必须加引号，否则地址里的 & 会被 cmd 当成命令分隔符。
const target = `${webUrl}/#agentUrl=${encodeURIComponent("http://127.0.0.1:17371")}&agentToken=${encodeURIComponent(token)}`;
console.log(`[open-agent-page] 正在打开画布页面并连接本地 Agent：${webUrl}`);
const opener = process.platform === "win32"
    ? { file: "cmd", args: ["/c", "start", '""', `"${target}"`] }
    : process.platform === "darwin"
        ? { file: "open", args: [target] }
        : { file: "xdg-open", args: [target] };
await new Promise((resolve) => {
    execFile(opener.file, opener.args, { windowsVerbatimArguments: true }, (error) => {
        if (error) console.log(`[open-agent-page] 自动打开失败，请手动访问：${webUrl}`);
        resolve();
    });
});
