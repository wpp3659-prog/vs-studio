// 官方插件集中构建:一次进程构建所有官方插件 + 生成清单,产物进 dist/(已 gitignore)。
// 官方插件目录本身不各自安装依赖:统一从本目录 node_modules 解析 SDK(nodePaths)。
// CI(publish-plugins.yml)把 dist/ 强推到 plugins-dist 分支,前端经 jsDelivr 远程拉取。
// 本地自测:`npm install && npm run build`,再把 VITE_PLUGIN_REGISTRY_URL 指向本地 dist。
import { build } from "esbuild";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "dist");
const nodeModules = join(root, "node_modules");

// 官方插件登记表:新增官方插件在此登记即可。
// 版本不在这里写死 —— 从各插件的 package.json 读取(单一真源),
// 与插件 src 里 definePlugin({version}) 保持一致,避免清单与产物版本脱节。
const OFFICIAL = [
    { id: "markdown", dir: "markdown", name: "Markdown 节点", description: "在画布中编辑与渲染 Markdown", icon: "📝" },
    { id: "svg", dir: "svg", name: "SVG 节点", description: "透明背景渲染 SVG,可接收上游文本节点的 SVG 源码", icon: "🔷" },
    { id: "html", dir: "html", name: "HTML 节点", description: "沙箱 iframe 渲染 HTML,支持 {{input}} 注入上游文本", icon: "🌐" },
    { id: "panorama", dir: "panorama", name: "3D 全景节点", description: "查看 360° 等距柱状全景图,可从上游图片节点取图", icon: "🧭" },
    { id: "sticky-note", dir: "sticky-note", name: "便利贴节点", description: "可自选颜色、双击编辑、拖动即可移动的便利贴", icon: "📌" },
    { id: "code-block", dir: "code-block", name: "代码块节点", description: "等宽展示与编辑代码,行号显示 + 一键复制,可接收上游文本", icon: "🧩" },
    { id: "table", dir: "table", name: "表格节点", description: "画布内直接编辑的表格,支持增删行列,可输出 CSV", icon: "📋" },
    { id: "web-embed", dir: "web-embed", name: "网页嵌入节点", description: "在画布中嵌入网页(iframe),可从上游文本节点读取网址", icon: "🖥" },
    { id: "json-viewer", dir: "json-viewer", name: "JSON 查看器", description: "格式化展示 JSON,错误提示 + 一键复制,可接收上游文本", icon: "🧾" },
    { id: "countdown", dir: "countdown", name: "倒计时节点", description: "画布倒计时器:预设时长、暂停/继续/加时,走时钟低频刷新", icon: "⏱" },
    { id: "todo-list", dir: "todo-list", name: "待办清单节点", description: "勾选式待办清单:回车添加、点击完成、一键清除已完成项", icon: "✅" },
    { id: "storyboard", dir: "storyboard", name: "分镜表节点", description: "影视/TVC 分镜表:镜头号·景别·画面·台词·时长·提示词,一键复制全部提示词", icon: "🎬" },
    { id: "shot-card", dir: "shot-card", name: "镜头提示词卡", description: "单镜头提示词组装:中文描述+风格芯片,一键 AI 转写为英文生成提示词", icon: "🎥" },
    { id: "aspect-frame", dir: "aspect-frame", name: "画幅预览节点", description: "按画幅显示安全框(动作区/字幕区),规划横屏/竖屏/宽银幕多版本", icon: "🖼" },
    { id: "mood-palette", dir: "mood-palette", name: "色彩氛围卡", description: "给场景定色板(5 色)+ 氛围说明,统一美术与生图色调", icon: "🎨" },
    { id: "line-card", dir: "line-card", name: "台词卡", description: "角色台词卡:台词 + 表演提示,一键复制完整台词本", icon: "💬" },
    { id: "director-styles", dir: "director-styles", name: "导演风格库", description: "24 位导演视觉风格档案:点选即得英文风格提示词,可拼进生图/生视频提示词", icon: "🎬" },
    { id: "script-studio", dir: "script-studio", name: "剧本工坊", description: "AI 剧本创作:创意 brief + 成片形式 → 分场剧本,支持多风格改写与复制", icon: "📜" },
    { id: "prompt-template", dir: "prompt-template", name: "提示词模板库", description: "把常用提示词存成 {{变量}} 模板,填空复用一键复制", icon: "🏷" },
    { id: "color-grade", dir: "color-grade", name: "调色风格卡", description: "12 种专业调色预设:色板 + 英文调色提示词,统一整片色调", icon: "🌈" },
    { id: "negative-preset", dir: "negative-preset", name: "负面词预设", description: "常用负面提示词分组勾选,组合一键复制(画质/畸形/水印/视频专用等)", icon: "🚫" },
    { id: "camera-moves", dir: "camera-moves", name: "运镜词典", description: "20 种专业运镜:说明 + 英文运镜提示词,可直接拼进视频生成提示词", icon: "🎥" },
    { id: "emotion-guide", dir: "emotion-guide", name: "表演情绪库", description: "20 种人物表演情绪:表演要点 + 英文表情肢体提示词", icon: "🎭" },
    { id: "lighting-setups", dir: "lighting-setups", name: "布光方案库", description: "16 种经典布光方案:图解说明 + 英文布光提示词", icon: "💡" },
    { id: "composition-guide", dir: "composition-guide", name: "构图指南", description: "8 种经典构图的叠加示意:三分法/黄金分割/对角线/螺旋等,附英文构图提示词", icon: "📐" },
    { id: "style-eras", dir: "style-eras", name: "美术风格库", description: "20 种美术方向与年代风格:关键元素 + 英文风格提示词", icon: "🏛" },
    { id: "material-texture", dir: "material-texture", name: "材质质感库", description: "30 种材质质感关键词:分类检索 + 英文材质提示词", icon: "🧱" },
    { id: "color-wheels", dir: "color-wheels", name: "色彩和谐生成器", description: "按色彩理论实时计算和谐配色:互补/类似/三角/分裂互补/四角/单色阶", icon: "🌈" },
    { id: "video-prompt-builder", dir: "video-prompt-builder", name: "视频提示词构建器", description: "结构化组装视频生成提示词:首帧/动作/运镜/镜头/氛围/时长,一键复制", icon: "🎞" },
    { id: "transitions", dir: "transitions", name: "转场词典", description: "20 种专业转场手法:说明 + 英文转场提示词,写进脚本与剪辑提示", icon: "🔀" },
    { id: "sound-design", dir: "sound-design", name: "音效氛围库", description: "20 种专业音效与氛围声:说明 + 英文声音设计提示词", icon: "🔊" },
    { id: "wardrobe-props", dir: "wardrobe-props", name: "服化道词库", description: "20 条服装/妆容/道具词条:说明 + 英文造型提示词,统一人物与场景质感", icon: "👔" },
    { id: "ai-storyboard", dir: "ai-storyboard", name: "AI 分镜自动化", description: "输入创意 brief + 镜头数,AI 生成逐镜分镜表(景别/画面/英文提示词),一键复制全部提示词", icon: "🎞" },
    { id: "vo-script", dir: "vo-script", name: "旁白配音稿", description: "AI 按主题与总秒数写中文旁白稿,带时间段标注与字数/语速校验", icon: "🎙" },
    { id: "prompt-chain", dir: "prompt-chain", name: "首尾帧提示词链", description: "首帧→尾帧→动作三段式输入,AI 生成首尾帧视频生成的完整英文提示词链", icon: "🔗" },
    { id: "shot-timing", dir: "shot-timing", name: "镜头时长预算", description: "逐镜录入秒数,自动合计并与目标成片时长对比,超时/欠时一目了然", icon: "⏳" },
    { id: "ad-teardown", dir: "ad-teardown", name: "广告拆解卡", description: "粘贴广告描述,AI 按专业框架拆解:钩子/结构节奏/视听手法/文案亮点/可偷师清单", icon: "🔍" },
    { id: "character-bible", dir: "character-bible", name: "角色圣经", description: "固定角色身份锚点、外观、服装与表演细节，生成跨镜头一致性设定和英文提示词", icon: "🧑‍🎤" },
    { id: "character-sheet", dir: "character-sheet", name: "角色三视图", description: "一次生成正面/侧面/背面角色设定图，支持四视图与表情九宫格，作为跨镜头一致性锚点", icon: "🧍" },
    { id: "story-push", dir: "story-push", name: "剧情推演", description: "一个镜头推演出四格剧情、前后画面或三镜流程，先排走位再生成，减少抽卡", icon: "🎞" },
    { id: "shot-teardown", dir: "shot-teardown", name: "拉片复刻", description: "参考视频抽帧逐帧拆解，输出结构分析与同结构复刻分镜表", icon: "🎯" },
    { id: "scene-bible", dir: "scene-bible", name: "场景圣经", description: "锁定地点空间关系、视觉锚点、固定陈设和主光方向，辅助跨镜头场景一致", icon: "🏠" },
    { id: "lens-guide", dir: "lens-guide", name: "焦段镜头指南", description: "18 组广角/标准/人像/长焦/变形宽银幕焦段参考，解释透视效果与适用景别，附英文镜头提示", icon: "🔭" },
    { id: "blocking-board", dir: "blocking-board", name: "场面调度俯视板", description: "在俯视平面图安排演员与机位，标记 180 度关系轴与机位侧，减少正反打方向错误", icon: "🗺" },
    { id: "coverage-planner", dir: "coverage-planner", name: "镜头覆盖规划器", description: "把一场戏规划为主镜头/双人/正反打/单人/反应/插入与剪辑保险镜头，并检查轴线与视线", icon: "🎬" },
    { id: "continuity-checker", dir: "continuity-checker", name: "连戏连续性检查", description: "检查分镜之间的轴线、视线、动作、服装、道具、场景与光线连续性，引用证据并区分风险与待确认项", icon: "🧷" },
    { id: "edit-rhythm", dir: "edit-rhythm", name: "剪辑节奏规划器", description: "按目标时长生成精确时间码剪辑节奏表：画面、转场、旁白、音乐音效与品牌落点", icon: "⏱" },
    { id: "delivery-qc", dir: "delivery-qc", name: "成片交付检查表", description: "24 项可勾选的影视/TVC 交付复核清单，含叙事品牌、画面连续性、声音、字幕合规与文件导出", icon: "✅" },
    { id: "comfyui-workflow", dir: "comfyui-workflow", name: "ComfyUI 工作流", description: "把本机 ComfyUI 的 API 工作流接进画布:选提示词节点、运行、结果直接落到画布,支持上游图片作输入", icon: "🛠" },
];

// 读取插件 package.json 的 version 作为清单版本的唯一来源
async function readPluginVersion(dir) {
    const pkg = JSON.parse(await readFile(join(root, "..", dir, "package.json"), "utf8"));
    if (!pkg.version) throw new Error(`插件 ${dir} 的 package.json 缺少 version`);
    return pkg.version;
}

await mkdir(outDir, { recursive: true });
// 清理旧构建产物但保留 dist/.git：dist 是独立发布仓库，不能被构建清掉，
// 否则后续 git 命令会向上找到主项目仓库并把产物误提交进去。
for (const entry of await readdir(outDir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    await rm(join(outDir, entry.name), { recursive: true, force: true });
}

for (const plugin of OFFICIAL) {
    await build({
        entryPoints: [join(root, "..", plugin.dir, "src", "index.tsx")],
        outfile: join(outDir, `${plugin.id}.js`),
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2020",
        // automatic JSX → SDK 的 jsx-runtime(内部用宿主 React),react external
        jsx: "automatic",
        jsxImportSource: "@vs-studio/plugin-sdk",
        loader: { ".ts": "ts", ".tsx": "tsx", ".css": "text" },
        external: ["react", "react-dom"],
        minify: true,
        nodePaths: [nodeModules],
    });
    console.log(`built ${plugin.id}.js`);
}

const manifest = {
    // 清单结构版本;entry 为相对本清单的 bundle 文件名,由前端解析成绝对 URL
    version: 1,
    plugins: await Promise.all(
        OFFICIAL.map(async (plugin) => ({
            id: plugin.id,
            name: plugin.name,
            version: await readPluginVersion(plugin.dir),
            description: plugin.description,
            icon: plugin.icon,
            entry: `${plugin.id}.js`,
        })),
    ),
};
await writeFile(join(outDir, "official-plugins.json"), JSON.stringify(manifest, null, 4) + "\n");
// jsDelivr 对同一 URL 的 purge 有时不生效(边缘缓存顽固)。
// 当前清单放在 v4/ 子目录作为独立缓存键；再遇到陈旧时需递增目录版本并同步前端默认地址。
// v4 清单位于子目录，entry 必须回到上一层才能找到 dist 根目录的 bundle。
// 对策:再次遇到清单不更新时,把这里的 "v4" 递增为 "v5" 并同步更新前端默认地址。
await mkdir(join(outDir, "v4"), { recursive: true });
const versionedManifest = { ...manifest, plugins: manifest.plugins.map((item) => ({ ...item, entry: `../${item.entry}` })) };
await writeFile(join(outDir, "v4", "official-plugins.json"), JSON.stringify(versionedManifest, null, 4) + "\n");
console.log(`wrote official-plugins.json (${OFFICIAL.length} plugins) → dist/ 与 dist/v4/`);
