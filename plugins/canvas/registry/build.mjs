// 官方插件集中构建:一次进程构建所有官方插件 + 生成清单,产物进 dist/(已 gitignore)。
// 官方插件目录本身不各自安装依赖:统一从本目录 node_modules 解析 SDK(nodePaths)。
// CI(publish-plugins.yml)把 dist/ 强推到 plugins-dist 分支,前端经 jsDelivr 远程拉取。
// 本地自测:`npm install && npm run build`,再把 VITE_PLUGIN_REGISTRY_URL 指向本地 dist。
import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
];

// 读取插件 package.json 的 version 作为清单版本的唯一来源
async function readPluginVersion(dir) {
    const pkg = JSON.parse(await readFile(join(root, "..", dir, "package.json"), "utf8"));
    if (!pkg.version) throw new Error(`插件 ${dir} 的 package.json 缺少 version`);
    return pkg.version;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

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
// 额外把清单写入 v2/ 子目录:新路径 = 全新缓存键,遇到清单缓存陈旧时改用该路径即可。
// 对策:再次遇到清单不更新时,把这里的 "v2" 递增为 "v3" 并同步更新前端默认地址。
await mkdir(join(outDir, "v2"), { recursive: true });
await writeFile(join(outDir, "v2", "official-plugins.json"), JSON.stringify(manifest, null, 4) + "\n");
console.log(`wrote official-plugins.json (${OFFICIAL.length} plugins) → dist/ 与 dist/v2/`);
