# Terminal Projects

> 在一个 VS Code 工作区中管理多个独立终端，尤其适合并行运行多个 Claude CLI 会话。
>
> Manage multiple independent terminals in one VS Code workspace—especially useful for running several Claude CLI sessions in parallel.

**GitHub:** [opdify/vscode-terminal-projects](https://github.com/opdify/vscode-terminal-projects)

## 中文

### 这个插件做什么？

Terminal Projects 是一款 VS Code 多终端管理插件。它可以在一个 VS Code 窗口中，按“工作目录 → Terminal”的层级创建、组织和切换多个相互独立的真实 PTY 终端。

每个终端都有独立的 shell、工作目录、进程和输出。切换终端只会改变当前显示的会话，其他终端仍会在后台继续运行。

### 典型使用场景

- 在同一个代码仓库中同时运行多个 Claude CLI 会话，让它们分别处理前端、后端、测试或代码审查任务。
- 在一个工作目录中并行运行开发服务器、测试、日志监控和普通命令行。
- 在一个 VS Code 窗口中管理多个本地项目目录，避免反复切换窗口。
- 通过 Remote SSH 管理远端目录中的多个独立终端会话。

### 核心功能

- 一个 Folder 下可以创建多个相互独立的 `node-pty` 终端。
- 支持添加本地目录或 Remote SSH 远端目录，不修改当前 VS Code workspace。
- 通过左侧 Terminal Projects 视图快速展开、收起和切换会话。
- 隐藏的终端继续运行并接收输出，不会因为切换而重建进程。
- 支持 ANSI、TUI、Ctrl+C/Ctrl+D、方向键、Tab、窗口 resize、复制和粘贴。
- 支持终端重命名、终止、自然退出状态和 Folder 删除确认。

### 快速使用

1. 点击左侧 Activity Bar 中的 Terminal Projects 图标。
2. 点击 `Add Folder…`，选择工作目录。
3. 将鼠标移到 Folder 上，点击行尾的 `+` 创建终端。
4. 在同一个 Folder 下重复创建多个终端，即可并行运行多个 Claude CLI 或其他命令行任务。
5. 点击终端名称，在唯一的 Terminal Surface 中快速切换。

## English

### What does this extension do?

Terminal Projects is a multi-terminal manager for VS Code. It lets you create, organize, and switch between multiple independent PTY terminals using a “working folder → terminal” hierarchy inside a single VS Code window.

Every terminal has its own shell, working directory, processes, and output stream. Switching terminals only changes the visible session—the other terminals keep running in the background.

### Typical use cases

- Run several Claude CLI sessions in the same repository, with separate sessions handling frontend, backend, testing, or code review work.
- Run a development server, tests, log monitoring, and regular shell commands side by side in one working directory.
- Manage terminals for multiple local project folders without repeatedly switching VS Code windows.
- Manage multiple independent terminal sessions in remote directories through Remote SSH.

### Key features

- Create multiple independent `node-pty` terminals under each folder.
- Add local or Remote SSH folders without changing the current VS Code workspace.
- Expand, collapse, and switch sessions from the Terminal Projects Activity Bar view.
- Keep hidden terminals running and receiving output without recreating their processes.
- Support ANSI, TUI applications, Ctrl+C/Ctrl+D, arrow keys, Tab, resize, copy, and paste.
- Rename and terminate terminals, detect natural exits, and confirm folder removal.

### Quick start

1. Open Terminal Projects from the VS Code Activity Bar.
2. Click `Add Folder…` and choose a working directory.
3. Hover over the folder and click `+` to create a terminal.
4. Create more terminals under the same folder to run multiple Claude CLI sessions or other command-line tasks in parallel.
5. Click a terminal name to switch the shared Terminal Surface to that session.

## Remote SSH

Terminal Projects is declared as a workspace extension. In a Remote SSH window, directory validation, extension code, and `node-pty` all run on the remote Extension Host, while the terminal interface is rendered locally by VS Code.

Terminal Projects 被声明为 workspace extension。在 Remote SSH 窗口中，目录校验、扩展代码和 `node-pty` 都运行在远端 Extension Host，终端界面仍由本地 VS Code 渲染。

## Settings / 设置

- `terminalProjects.scrollback`: Maximum retained lines for each terminal frontend. Default: 5000. / 每个终端前端保留的最大行数，默认 5000。
- `terminalProjects.outputBufferBytes`: Raw output retained for rebuilding a closed Terminal Surface. Default: about 2 MiB per session. / 用于重建终端页面的原始输出缓存，默认每个会话约 2 MiB。
- `terminalProjects.shell`: Optional shell path. The system default is used when empty. / 可选 shell 路径，留空时使用系统默认值。
- `terminalProjects.shellArgs`: Arguments passed to the shell. / 传递给 shell 的参数。

## Development / 本地开发

Requires Node.js 22+, VS Code 1.95+, and the native build environment required by `node-pty`.

需要 Node.js 22+、VS Code 1.95+，以及 `node-pty` 所需的本机原生构建环境。

```bash
npm install
npm run check
npm test
npm run build
```

Run `npm run package` to validate, test, build, and create a platform-specific VSIX. See [PUBLISHING.md](PUBLISHING.md) for the complete publishing process.

执行 `npm run package` 可完成校验、测试、构建并生成当前平台的 VSIX。完整发布流程见 [PUBLISHING.md](PUBLISHING.md)。
