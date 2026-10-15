# 把 npm 包名与 GitHub 仓库地址从 basketikun 换成 wpp3659-prog。
# 跳过锁文件（package-lock.json / bun.lock），它们要么由 npm 重新生成，
# 要么手改会导致依赖树与声明不一致。
import io
import os

OLD = "basketikun"
NEW = "wpp3659-prog"

SKIP_NAMES = {"package-lock.json", "bun.lock"}
SKIP_DIRS = {"node_modules", ".git", "dist", ".workbuddy-ai"}

ROOTS = [".", "canvas-agent", "canvas-proxy", "web", "plugins", "docs", ".github"]
EXTS = {".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".mdx", ".yml", ".yaml", ".toml", ".html", ".bat", ".txt"}

hits = []
for root in ROOTS:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name in SKIP_NAMES:
                continue
            if os.path.splitext(name)[1].lower() not in EXTS:
                continue
            path = os.path.join(dirpath, name)
            try:
                with io.open(path, "r", encoding="utf-8") as fh:
                    text = fh.read()
            except (UnicodeDecodeError, OSError):
                continue
            if OLD not in text:
                continue
            count = text.count(OLD)
            text = text.replace(OLD, NEW)
            with io.open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(text)
            hits.append((path.replace("\\", "/"), count))

hits.sort(key=lambda item: -item[1])
for path, count in hits:
    print("%3d  %s" % (count, path))
print("\nfiles changed: %d, occurrences: %d" % (len(hits), sum(c for _, c in hits)))
