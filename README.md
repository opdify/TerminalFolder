# Terminal Projects

在一个 VS Code 窗口里，按“项目目录 → Terminal”的层级管理多个真正独立的 PTY 终端。左侧 Activity Bar 用来组织和选择，右侧始终复用同一个 Terminal Surface。

## 一期能力

- 添加任意本地或 Remote SSH 远端目录，不修改当前 workspace。
- Folder 列表随当前 workspace 持久化，Terminal 不跨窗口持久化。
- 每个 Folder 可创建多个独立的 `node-pty` 会话，初始 `cwd` 严格使用所选目录。
- 单一 xterm.js 页面快速切换；隐藏会话继续运行并继续接收输出。
- ANSI、键盘、Ctrl+C/Ctrl+D、方向键、Tab、滚动、复制、粘贴和 TUI resize。
- Terminal 重命名、显式 Kill、自然退出状态、Folder 删除确认。
- 每个会话的前端 scrollback 和扩展端原始输出缓存都有上限。
- 扩展声明为 workspace extension，因此 Remote SSH 下 PTY 运行在远端 Extension Host。

## 本地开发

要求 Node.js 22+、VS Code 1.95+，并具备 `node-pty` 所需的本机原生构建环境。

```bash
npm install
npm run check
npm test
npm run build
```

`npm run package` 会校验、测试、构建并生成带当前平台标记的 VSIX。

随后在 VS Code 中按 `F5` 启动 Extension Development Host。开发实例左侧会出现 Terminal Projects 图标。

基本操作：

1. 点击 `Add Folder…` 选择项目目录。
2. 将鼠标移到 Folder 上，点击行尾的 `+`。
3. 点击任意 Terminal，在唯一的 Terminal Surface 中切换。
4. 右键 Terminal 可 Rename；行尾垃圾桶用于 Kill。
5. 右键 Folder 可 Remove；存在 Terminal 时会先要求确认并终止它们。

macOS 使用 `Cmd+C`/`Cmd+V`，Linux/Windows 使用 `Ctrl+Shift+C`/`Ctrl+Shift+V`。右键有选区时复制，无选区时粘贴。

## Remote SSH

`extensionKind` 固定为 `workspace`。在 Remote SSH 窗口中，本扩展代码、目录校验和 `node-pty` 都运行于远端，因此 `hostname` 与 `pwd` 会反映远端主机和所选远端目录；Webview 仍由本地 VS Code 渲染。

`node-pty` 是原生模块，VSIX 必须为目标平台构建。直接从源码调试时，请在远端仓库执行 `npm install`。发布时使用 `.github/workflows/package.yml` 在各目标系统分别生成带平台标记的 VSIX；不能把 macOS 上生成的 VSIX 当作 Linux Remote SSH 构建使用。

完整的首发和版本更新流程见 [PUBLISHING.md](PUBLISHING.md)。

## 设置

- `terminalProjects.scrollback`：每个 xterm 前端保留的最大行数，默认 5000。
- `terminalProjects.outputBufferBytes`：Terminal Surface 被关闭后用于重建会话的原始流缓存，默认每会话约 2 MiB。
- `terminalProjects.shell`：可选 shell 路径；留空时使用 Extension Host 的 `SHELL`/系统默认值。
- `terminalProjects.shellArgs`：传给 shell 的参数。

## 生命周期

切换 Terminal 只改变当前显示，不重建 PTY。关闭 Terminal Surface 页面也不会停止会话；重新打开时会从有界缓存恢复。执行 Kill、删除 Folder、关闭 VS Code 窗口或终止 Extension Host 才会结束对应进程。Remote SSH 断开后不恢复旧会话。
