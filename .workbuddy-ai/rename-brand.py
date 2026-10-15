# 把界面显示文案里的品牌名 Infinite Canvas 改成 VS studio。
# 只动"给人看的文案"，不碰技术标识符（infinite-canvas 插件名/配置目录/存储库名/MCP 名）
# 也不碰下载地址（basketikun 那些另行处理）。
import io
import sys

TARGETS = [
    ("web/src/i18n/locales/en-US.ts", [
        ("Write a model request script for Infinite Canvas.", "Write a model request script for VS studio."),
        ("in <canvas>Infinite Canvas</canvas>", "in <canvas>VS studio</canvas>"),
        ("View browser data saved by Infinite Canvas,", "View browser data saved by VS studio,"),
        ('mainDatabase: "Infinite Canvas data"', 'mainDatabase: "VS studio data"'),
        ("Install the Infinite Canvas plugin in the Codex app", "Install the VS studio plugin in the Codex app"),
        ('diagnostics: "Infinite Canvas Agent diagnostics"', 'diagnostics: "VS studio Agent diagnostics"'),
    ]),
    ("web/src/i18n/locales/zh-CN.ts", [
        ("请为 Infinite Canvas 编写一段模型调用脚本。", "请为 VS studio 编写一段模型调用脚本。"),
        ("查看 Infinite Canvas 在浏览器中保存的数据量", "查看 VS studio 在浏览器中保存的数据量"),
        ('mainDatabase: "Infinite Canvas 主数据"', 'mainDatabase: "VS studio 主数据"'),
        ("在 Codex app 安装 Infinite Canvas 插件后", "在 Codex app 安装 VS studio 插件后"),
        ('diagnostics: "Infinite Canvas Agent 诊断"', 'diagnostics: "VS studio Agent 诊断"'),
    ]),
]

total = 0
for path, pairs in TARGETS:
    with io.open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    changed = 0
    for old, new in pairs:
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            changed += n
            print("  [OK] %-58s x%d" % (old[:56], n))
        else:
            print("  [--] not found: %s" % old[:56])
    if changed:
        with io.open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
    print("%s -> %d replacement(s)" % (path, changed))
    total += changed

print("\ntotal replacements: %d" % total)
