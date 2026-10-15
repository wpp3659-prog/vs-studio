# 项目约定（AI 开发沉淀）

## 本项目已改为自有品牌：VS studio / wpp3659-prog

**这是一个 fork 出去的自有产品，已与上游 `basketikun/infinite-canvas` 切断。**
用户明确表示「后续不需要上游更新，自己做产品」，因此**不要再建议同步上游**。

- 品牌显示名：**VS studio**
- GitHub 账号 / 仓库所有者：**wpp3659-prog**
- npm 账号 / 包作用域：**`@wpp3659-prog`**
- 用户自己的 git 仓库已在项目根目录初始化（`git init`，默认分支 `master`），
  基线提交 `97ba64e 初始存档`，改名提交 `07c1e59`、`be30c4d 第 3 层改名`。
- 用户的 GitHub 主页：`https://github.com/wpp3659-prog`
- **⚠️ 仓库还没建。** 所有链接（版本检查、插件注册表、Docker 镜像、badge）已统一为
  `wpp3659-prog/vs-studio`；**用户建仓库时必须取 `vs-studio` 这个名字**，否则自动更新会 404。

### 改名已全部完成（第 1/2/3 层），新名统一为 `vs-studio`

界面文案、配置目录（`~/.vs-studio`）、localforage 库名、localStorage 键前缀、
Codex 插件名、MCP 服务器名与工具名、`@vs-studio/plugin-sdk`、画布组件
（`vs-studio.tsx` / `VsStudio`）**全部已切换**。历史数据靠一次性迁移自动搬迁。

### ⚠️ 这些地方**刻意保留旧名 `infinite-canvas`，不要「顺手清掉」**

| 位置 | 为什么必须保留 |
|---|---|
| `config.ts` 的 `LEGACY_CONFIG_DIR = ~/.infinite-canvas` | 旧配置目录搬迁的源路径 |
| `localforage-storage.ts` 的 `LEGACY_STORAGE_DB_NAME` | 旧 IndexedDB 库搬迁的源 |
| `web/index.html` 的 `LEGACY = "infinite-canvas:"` | 旧 localStorage 键搬迁脚本 |
| `codex-home.ts` 的 `LEGACY_BLOCK_START/END` | 用户 `~/.codex/config.toml` 里可能已有旧托管区块；只认新标记会导致旧区块残留 + 下一轮重复追加。`stripManagedBlock` **新旧各清一次**，改动时两条都要保住 |
| `LICENSE` 的 `Copyright (c) 2026 basketikun` | **MIT 强制要求**。用户问过「能只写我自己吗」→ 答案是不能（侵权）。现为原作者 + `wpp3659-prog` 两行 |
| `一键启动.bat` 里的 `infinite-canvas-main` | 那是**真实文件夹名**，改了找不到项目 |

### ⚠️ 改名最容易踩的两个坑

1. **`infinite-canvas` 既是品牌词，也是代码标识符**（组件名 / 文件名 / 路径 / 包名）。
   **通配替换会把代码标识符一起改坏** —— 曾把 `project.tsx` 的
   `@/components/canvas/infinite-canvas` 改成 `vs-studio` 而文件没改名 → 编译失败。
   **规则：标识符类改名先改文件与定义、再改引用，单独精确替换，不进通配脚本。**
   （`window.InfiniteCanvasRuntime` 是插件 SDK 全局契约，**必须保留**。）
2. **配置目录改名要 grep 字面量 `.infinite-canvas`**，不能只找 `CONFIG_DIR` 引用点。
   曾漏 `open-agent-page.mjs`（写死旧目录）→ 改名后读不到 token、浏览器静默不打开。
   同理，**展示给用户的 CLI 命令**（`codex mcp remove xxx`）也要纳入改名清单。

### 改名后必须做的验证

1. `canvas-agent` 与 `web` 各跑一次 `tsc --noEmit`（`web` 有 1 个**既有**无关错误：
   `model-script-editor.tsx` 的 antd `styles.content`）。
2. 改完 `canvas-agent/src/**` **必须 `tsc` 重新 build**，否则 `dist/` 还是旧包名。
3. `npm test` 应为 **133 tests / 131 pass / 0 fail / 2 skip**。
4. 全仓复查残留：`grep -rn "infinite-canvas" . --include=...`，排除
   `node_modules` / `dist` / `package-lock.json`；剩下的应**只有**上面表格里那些。
5. ⚠️ **`package-lock.json` 与 `bun.lock` 不要手改**（锁文件，手改会破坏依赖一致性）。

## Agent 模型下拉 = 渠道模型清单，不是 Codex 内置目录

**这是刻意的设计，不要改回读内置目录。**

- 链路：`resolveAgentChannel()`（`web/src/stores/use-config-store.ts`）
  把渠道里**所有 text 能力的模型**塞进 `channel.models` →
  `POST /agent/codex/channel` 存进 `canvas-agent.json` 的 `agentChannel.models` →
  `GET /agent/codex/models`（`canvas-agent/src/server/http.ts`）**有渠道清单时直接返回它**，
  只有**没配置渠道**时才回落到 `listCodexModels()`（Codex 内置目录）。

**为什么必须这样**（踩过的坑）：用户渠道里有 `gpt-6-astra` / `gpt-6-luna` / `gpt-6-sol` 等模型，
但下拉显示的是内置目录的 `GPT-5.6-Sol / Terra / Luna / 5.5 / 5.2` ——
**渠道里真实可用的模型选不到，内置目录里中转站根本不支持的模型反而可选**。
用户会误以为「模型列表拉取不全」。

**连带约定**：
- 渠道模型清单变化必须能触发重新同步：`channelKey`（`local-agent-panel.tsx`）
  和 `appliedChannelKey`（`canvas-agent/src/agent/codex.ts`）都要把模型名列表拼进去。
- 内置目录里的 `gpt-5.4` 等是 `visibility: "hide"`，正常不该出现；
  如果界面上出现了，说明拿到了**更早的响应缓存**，见下面 304 那条。

## ⚠️ 前端推 `channel: null` 会清空 Agent 已保存的渠道

`POST /agent/codex/channel` 必须区分两种「空」：

- **前端拿不到渠道**（换浏览器 / 清过 localStorage / 多开一个页面）→ `channel: null`
- **用户显式关闭**「用于画布 Agent」→ 算出 `null`，带 `clear: true`

若无脑 `config.agentChannel = null; saveConfig(config)`，**任何一次用没有渠道配置的
浏览器打开 Agent，都会把用户配好的渠道抹掉**。症状是「模型下拉突然又变回 Codex 内置清单」，
日志出现 `Applied agent channel hasChannel=false`（此前一直是 true）。

**已修**（`canvas-agent/src/server/http.ts`）：只有显式带 `clear: true` 才允许清除；
`raw == null/undefined` 时保持原渠道不变，仍返回 `ok:true, kept:true`。
前端配套：画布配了渠道但后端说 `hasChannel=false` 时，往事件日志写明确提示，不静默展示内置列表。

**排查指纹**：Agent 日志里 `hasChannel` 从 `true` 翻成 `false` 那行的时间点，
对应「某个没有渠道配置的前端连上来了」。

## ⚠️ 起 Agent 做验证时，绝对不要带 `PORT` 环境变量

`canvas-agent/src/config.ts` 的 `loadConfig` 在**配置不存在**时会用
`process.env.PORT` 生成 url 并**落盘**。踩过一次：为了在别的端口跑验证脚本，
带了 `PORT=17399` 启动，把用户 `~/.infinite-canvas/canvas-agent.json` 里的
url 从 `17371` 永久写成 `17399` → **画布页面按原地址再也连不上，报「连接失败」**。

现在已加保护：**已有配置时 `PORT` 只作用于本次运行，不写回文件**
（`{ ...config, url: \`http://127.0.0.1:${port || portFromUrl(config.url)}\` }`，
且不再 `saveConfig`）。回归验证：带 `PORT=17399` 跑一次，磁盘配置仍须是 17371。

**更重要的通用规则**：验证 agent 行为时，**要么不带 PORT、要么改完立刻把配置还原**。
最稳的做法是不启动完整服务，直接单元测试目标函数。

**排查「连接失败」的顺序**：
1. 探端口 —— `env -u HTTP_PROXY ... curl 127.0.0.1:17371/health`（**必须清沙箱代理**，
   沙箱代理端口不固定，会返回误导性的 502/000）。
2. 比对 `canvas-agent.json` 里的 `url` 与页面里填的地址是否一致 —— **不一致就是本坑**。
3. 看日志 `grep "Canvas Agent started"` 的最后一条，确认最近一次实际监听的是哪个端口。

## 接口响应必须 no-store，否则浏览器 304 会静默吃掉刷新

`canvas-agent/src/server/http.ts` 里 `app.disable("etag")` + 全局 `Cache-Control: no-store` 中间件
**是必须保留的**，前端 `fetchAgentJson` 的 `cache: "no-store"` 同理。

原因：Express 默认开 ETag 且不设 `Cache-Control` 时，浏览器会带 `If-None-Match`，
服务端回 **304 无 body** → 前端 `res.json()` catch 成 `{}` → 列表被静默丢弃、界面停在旧值。
`res.ok` 对 304 是 `true`，靠 `if (!res.ok) throw` **拦不住**。

**症状指纹**：后端直连实测数据完整，但界面显示的是更早的列表（甚至含当前数据源里
根本不存在的条目）。查法：去 Agent 日志 grep 那个接口有没有 `status=304`。
完整排查流程见用户级 skill `http-304-stale-list-diagnosis`。

## 画布与素材的存储位置（回答「重启会不会丢」时用）

**全部存在浏览器本地（localforage / IndexedDB），与 canvas-agent 服务、与重启完全无关。**

- 库名统一 `infinite-canvas`，分几个 store：
  - `app_state` —— zustand persist 的通用 storage（`localforage-storage.ts`）
  - `canvas_store`（key `infinite-canvas:canvas_store`）—— **项目 / 节点 / 连线 / 对话**
  - `asset_store`（key `infinite-canvas:asset_store`）—— **「我的素材」列表**
  - `image_files` / `media_files` —— **图片、视频等二进制本体**（按 `storageKey` 存）
  - `image_previews` —— 缩略图缓存
  - `image_generation_logs` / `video_generation_logs` —— 生成历史
- 画布写入有 **400ms 防抖**（`use-canvas-store.ts` 的 `setItem`）：刚改完立刻关页面可能丢最后几下。

**因此：重启 Agent / 重开启动脚本 / 关浏览器都不会丢数据。**
真正会丢的场景只有：换浏览器、清浏览器数据（含「清除 Cookie 和站点数据」）、
换电脑、无痕模式。**这条不要写错——项目未接云同步。**

## ⚠️ `cleanupImages` 是真会删文件的，改它要有敬畏

`use-asset-store.ts` 的 `cleanupImages()` 会调 `cleanupUnusedImages` / `cleanupUnusedMedia`，
把「**没有被任何素材或画布节点或生成历史引用**」的二进制**真删掉**（`store.removeItem`）。

判定依据 `collectImageStorageKeys`（`image-storage.ts`）：递归遍历
`{ assets, projects, extra }` + 两个 generation_logs，收集所有 `storageKey`，**不在集合里的就删**。

触发点：目前只有 `removeAsset`（删除素材）会调。**但这是高危函数**——
任何「projects 为空 / 未 hydrate 完成就先跑清理」的情况都会把磁盘上的素材扫光。
→ **改这里之前必须确认调用时 `projects` 已 hydrate**；如果以后要在启动时加清理，必须先等两个 store 都 `hydrated: true`。

## 跨电脑保留数据 = 项目内置的 WebDAV 同步，不需要做数据库

**用户问「能不能账号登录、换电脑资产也在」时，答案是：项目已内置 WebDAV 同步，
不要去搭后端/数据库。** 入口：**设置 → WebDAV 同步**。

- 实现：`web/src/services/app-sync.ts` + `webdav-sync.ts`，**前端直连 WebDAV**。
- 同步 4 个域：`canvas` / `assets` / `image-workbench` / `video-workbench`，
  每域存 `manifest.json` + `files/`（含媒体二进制）。**刻意不含 AI API Key。**
- 配置：`localStorage["infinite-canvas:ai_config_store"]` 的 `webdav` 字段
  （`{ url, username, password, directory, lastSyncedAt }`）。
- 项目**完全没有后端 / 数据库 / 登录体系**（`canvas-agent` 只是本地转发，依赖里零数据库）。
  要到「换电脑也在」必须有云端存储，但 WebDAV 网盘就够了，**别去自建服务器**。
- 推荐给国内用户的网盘：**坚果云**（免费版支持 WebDAV）。
  ⚠️ 必须用**应用密码**（账户信息 → 安全选项 → 应用管理 → 添加应用），不能用登录密码。
- ⚠️ 注册地址是 `www.jianguoyun.com`；`dav.jianguoyun.com/dav/` 是**软件连接地址**，
  打开只会弹登录框、没有注册入口（用户踩过这个坑）。
- ⚠️ 坚果云要求**先建目录再放文件**；直接 PUT 到 `/dav/` 根目录会 404。

## 改状态机前必须先读同目录测试

`canvas-agent/src/canvas/session.ts` 里的对话状态机（`idle`/`preparing`/`ready`/`warning`/`running`/`failed`）
和 `src/server/http.ts` 的准备流程，**意图写死在 `src/canvas/session.test.ts`**：

- `prepare` 期间只要还有服务处于 `starting`，就必须保持 `preparing`（测试断言过）。
- 清单里**缺失 `infinite-canvas` 时判 `failed` 是有意设计**（测试 `requiredMissing` 分支断言过），
  不是缺陷 —— 不要"顺手修"成 `ready`。

**教训**：曾想把上面两条改成更"宽容"的逻辑，被既有测试当场拦下。
改这类状态机前，先 `grep` 同目录 `*.test.ts`。

## 「MCP 初始化中」卡死的真凶在 http.ts

`prepareDraftThread`（`canvas-agent/src/server/http.ts`）的去重守卫
`if (draftThreadStart) return draftThreadStart;` 会吞掉后到调用者的收尾逻辑；
而 `/agent/codex/threads/reset` 会先 `beginConversation()` 重置状态。
两者叠加 → 永远停在 `preparing`。

修复要点：去重命中时补一次 `completeConversationPreparation`；
且**只要拿到 threadId 就提交状态**，不要只在"工作空间没线程"时才提交。

## 常用变量名陷阱

- 画布页 `web/src/pages/canvas/project.tsx`：Agent 面板开关变量叫 **`agentPanelOpen`**，
  不是 `agentOpen`（`agentOpen` 是传给 `CanvasTopBar` 的 prop 名）。

## 截图来源判断

用户发来的截图先判断是不是本项目：**全仓库 grep 图中文案**。
搜不到 → 是外部参考 App 的设计稿（照做），不是待修 bug。
本项目的 Agent 相关文案都在 `web/src/i18n/locales/{zh-CN,en-US}.ts` 的 `agent.*`。

## ⚠️ 用户的 Agent 跑的是本地源码（`启动Agent-本地版.bat`）

早期用户跑的是已发布 npm 包 `npx -y @basketikun/canvas-agent@latest`；
**现在已统一改用根目录 `启动Agent-本地版.bat`**（`canvas-agent/` 本地 `npm run build` + `node dist/index.js`，端口 17371）。

**含义**：改 `canvas-agent/src/**` 后**必须重新 build** 才生效；
排查 agent 侧问题时，第一步永远是**取进程命令行**确认跑的是哪份代码：
`Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine`
（直读无输出时先 `Out-File` 到临时文件再 `Read`）。

## canvas-agent HTTP 鉴权：头名是 `x-canvas-agent-token`

- 鉴权靠 **`x-canvas-agent-token` 请求头**或 `?token=` 查询参数，
  **不是 `Authorization: Bearer`**。用错头 → 任何路径都 `401 {"ok":false,"error":"invalid token"}`。
- **鉴权中间件在所有业务路由之前**，所以**裸探测 401 无法区分「路由不存在」和「token 错」**——
  必须带对 token 看 404/200。
- 免鉴权公开端点：`GET /health`、`GET /config`。
- `POST /agent/codex/channel` 是渠道下发入口，响应 `{ok, hasChannel, home}`。

## Agent 连接模型：前端必须先连上，渠道才推得出去

三层链路：**画布网页(8760) ←→ canvas-agent(17371) ←→ Codex app-server**。

- 前端 `agentToken` 初值 = `localStorage["canvas-agent-token"] || ""`，
  `app-top-nav.tsx` 的自动连接守卫**遇到空 token 直接 return** → 永不自动连。
- 所以「Agent 面板从没连过」是高频故障根因：表现是服务端一直 `hasChannel=false`
  + codex 回落 openai 默认 → `401 wss://api.openai.com/v1/responses`。
- 便利机制：`#agentUrl=...&agentToken=...` 的 hash 引导（`readAgentUrlBootstrap`）
  可免手动填 token；`启动Agent-本地版.bat` 会用 `open-agent-page.mjs` 自动打开带引导的页面。
  **⚠️ Windows 下 `start` 打开带 `&` 的 URL 必须加引号**，否则 cmd 截断；
  要配 `execFile(..., { windowsVerbatimArguments: true })`。

## Agent 会话预热的两个相位/提交陷阱

`canvas-agent` 里「连接后一直显示 MCP 初始化中」可能有两条独立成因，改的时候两条都要顾及：

1. **提交时机**：`session.completeConversationMcpInventory`（`mcp.complete` 触发）与
   `completeConversationPreparation` 必须**一对**出现。只置 `conversationInventoryComplete`
   而不提交，就会永久 `preparing`。修法：让两者都走同一个私有 `settlePreparedConversation()` 收口。
2. **事件相位**：`codex-client.ts` 的 `resumeThread`/`startThread` 必须在**发请求前**
   把 threadId 放进 `preheatingThreadIds`，否则期间到达的 `mcpServer/startupStatus/updated`
   会被标成 `phase: "runtime"` 而丢弃，服务停在 `starting`。

判断某次 `mcp.startup` 是否被采纳，看 `phase` 是否为 `"preheat"`（`http.ts` 的 `emit` 只认这个）。
