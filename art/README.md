# 模型源脚本

这里保留原作者的 Blender Python 构建脚本，运行用 GLB 位于 `public/assets/`。脚本按自身位置解析项目路径，不依赖作者机器目录。普通安装与构建直接使用 GLB，无须 Blender。

`build_archive.py` 调用 `clear_reference_details.py`，后者使用 `internal_architecture.py` 与 `shell_reference_details.py`；`build_assembly.py` 复用结构并分组导出。`setup_studio.py` 设置展示场景。脚本运行会写入 `public/assets/` 及 `art/`，修改模型前请保存副本。

本公开整理版未复制原 `.blend`、截图和历史对照资源，以避免嵌入环境信息及重复大文件；保留可编辑文本脚本和必要生产模型。现有 GLB 元数据标识为 Blender glTF I/O v4.5.51。本次未运行 Blender 重建，不保证任意 Blender 版本重建后与现有模型逐字节一致。建模脚本和作者自制模型的授权见根目录 LICENSE 及 THIRD_PARTY_NOTICES.md。
