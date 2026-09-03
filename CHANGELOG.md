# Changelog

本项目的重要变更会记录在这里。

## 0.1.6 - 2026-09-03

### Changed

- 移除 Webview/xterm 自绘终端，改为直接创建并切换 VS Code 原生终端。
- Claude CLI、普通命令、字体抗锯齿、主题、复制粘贴和 TUI 布局现在完全使用 VS Code 原生实现。
- 移除 `node-pty`、xterm、输出缓存及自定义渲染依赖，显著缩小安装包。

## 0.1.5 - 2026-09-03

### Fixed

- 终端恢复 VS Code 原生的最小对比度设置，并完整使用当前主题的 ANSI 16 色，提升 Claude CLI 在浅色主题下的文字清晰度。
- 字体粗细、对比度和 GPU 加速方式跟随 `terminal.integrated` 设置，修改后无需重开终端即可生效。
- 切换 VS Code 主题时同步刷新终端颜色，同时保留 WebGL 对字符网格与复制选区的精确渲染。

## 0.1.4 - 2026-09-02

### Fixed

- 修复快捷键粘贴会被浏览器与 xterm 同时处理、导致文本重复两份的问题。
- 使用 Unicode 11 字符宽度和 WebGL 单元格渲染，修复 Claude CLI 中英文表格及复制选区偏移。
- 终端字体、字号、字距和行高跟随 VS Code `terminal.integrated` 设置，并在字体加载后重新适配尺寸。
- 使用与 VS Code 原生终端一致的 `TERM_PROGRAM` 环境标识，提高交互式 CLI 兼容性。

## 0.1.3 - 2026-09-02

### Changed

- 重写插件市场简介，补充中英文项目说明、Claude CLI 使用场景和 GitHub 链接。

## 0.1.2 - 2026-09-02

### Changed

- 插件市场与 VS Code Activity Bar 统一使用 Folder Terminal 图标。

## 0.1.1 - 2026-09-02

### Changed

- 左侧项目列表改为 Codex 风格：点击 Folder 行切换展开状态，并用关闭/打开文件夹图标反馈。
- 移除系统展开箭头、Terminal 状态图标和行内状态文字，只显示 Terminal 名称。
- Terminal 名称与 Folder 名称左侧对齐，并增大侧边栏图标、字体和行高。

## 0.1.0 - 2026-09-02

### Added

- 按项目目录组织多个独立 PTY 终端。
- 使用单一 Terminal Surface 在会话之间快速切换。
- 支持重命名、终止、窗口 resize、ANSI 输出和有界输出缓存。
- 支持 VS Code Remote SSH，并为 macOS、Linux 和 Windows 生成平台专用 VSIX。
