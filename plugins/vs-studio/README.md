# VS studio Plugin

让 Codex / ZCode 可以打开并操作 VS studio。

## 安装

### Codex

macOS / Linux：

```bash
git clone https://github.com/wpp3659-prog/vs-studio.git
cd vs-studio
codex plugin marketplace add "$(pwd)"
codex plugin add vs-studio@vs-studio-local
```

Windows PowerShell：

```powershell
git clone https://github.com/wpp3659-prog/vs-studio.git
cd vs-studio
codex plugin marketplace add "$PWD"
codex plugin add vs-studio@vs-studio-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

### ZCode

- 打开 **Settings → Plugin Management → Discover**，点击右上角 **`+`** 添加 marketplace。
- 选择 **本仓库目录**（`plugins/vs-studio`）或本仓库根目录，即可发现 `vs-studio` 插件并安装。
- 或在 ZCode 界面直接以本地目录方式加载该插件目录。

安装后新建一个任务，然后输入：

```text
帮我打开并连接到 VS studio
```
