# TerminalFolder

> 在一个 VS Code 工作区中管理多个独立终端，尤其适合并行运行多个 Claude CLI 会话。
>
> Manage multiple independent terminals in one VS Code workspace—especially useful for running several Claude CLI sessions in parallel.

**GitHub:** [opdify/TerminalFolder](https://github.com/opdify/TerminalFolder)

## 中文

### 这个插件做什么？

TerminalFolder 是一款 VS Code 多终端管理插件。它可以在一个 VS Code 窗口中，按“工作目录 → Terminal”的层级创建、组织和切换多个 VS Code 原生终端。

每个终端都有独立的 shell、工作目录、进程和输出。终端由 VS Code 原生终端编辑器负责渲染，因此字体、主题、复制粘贴、Claude CLI TUI 和快捷键行为都与手动创建的 VS Code 终端一致。终端显示在中间编辑器区域，可与放在右侧 Auxiliary Bar 的 TerminalFolder 管理视图同时使用；切换终端只会改变当前编辑器标签，其他终端仍会在后台继续运行。

### 典型使用场景

- 在同一个代码仓库中同时运行多个 Claude CLI 会话，让它们分别处理前端、后端、测试或代码审查任务。
- 在一个工作目录中并行运行开发服务器、测试、日志监控和普通命令行。
- 在一个 VS Code 窗口中管理多个本地项目目录，避免反复切换窗口。
- 通过 Remote SSH 管理远端目录中的多个独立终端会话。

### 核心功能

- 一个 Folder 下可以创建多个相互独立的 VS Code 原生终端。
- 支持添加本地目录或 Remote SSH 远端目录，不修改当前 VS Code workspace。
- 通过 TerminalFolder 视图快速展开、收起和切换会话。
- 终端显示在编辑器区域，不会与右侧 Auxiliary Bar 中的管理视图互相替换。
- 隐藏的终端继续运行并接收输出，不会因为切换而重建进程。
- 原生支持 ANSI、TUI、Ctrl+C/Ctrl+D、方向键、Tab、窗口 resize、复制和粘贴。
- 右键 Folder 或 Terminal 可在鼠标位置重命名和删除，重命名直接在当前行内完成。

### 快速使用

1. 点击 Activity Bar 中的 TerminalFolder 图标。
2. 点击 `Add Folder…`，选择工作目录。
3. 将鼠标移到 Folder 上，点击行尾的 `+` 创建终端。
4. 在同一个 Folder 下重复创建多个终端，即可并行运行多个 Claude CLI 或其他命令行任务。
5. 点击终端名称，在 VS Code 中间编辑器区域快速切换。

## English

### What does this extension do?

TerminalFolder is a multi-terminal manager for VS Code. It lets you create, organize, and switch between multiple VS Code native terminals using a “working folder → terminal” hierarchy inside a single VS Code window.

Every terminal has its own shell, working directory, processes, and output stream. Rendering is handled by VS Code's native terminal editor, so fonts, themes, copy and paste, Claude CLI TUI output, and shortcuts behave exactly like a terminal created directly in VS Code. Terminals open in the central editor area, so they can stay visible alongside TerminalFolder in the right Auxiliary Bar. Switching terminals only changes the active editor tab—the other terminals keep running in the background.

### Typical use cases

- Run several Claude CLI sessions in the same repository, with separate sessions handling frontend, backend, testing, or code review work.
- Run a development server, tests, log monitoring, and regular shell commands side by side in one working directory.
- Manage terminals for multiple local project folders without repeatedly switching VS Code windows.
- Manage multiple independent terminal sessions in remote directories through Remote SSH.

### Key features

- Create multiple independent VS Code native terminals under each folder.
- Add local or Remote SSH folders without changing the current VS Code workspace.
- Expand, collapse, and switch sessions from the TerminalFolder Activity Bar view.
- Open terminals in the editor area without replacing the management view in the right Auxiliary Bar.
- Keep hidden terminals running and receiving output without recreating their processes.
- Natively support ANSI, TUI applications, Ctrl+C/Ctrl+D, arrow keys, Tab, resize, copy, and paste.
- Right-click a folder or terminal to rename it inline or delete it from a menu at the pointer.

### Quick start

1. Open TerminalFolder from the VS Code Activity Bar.
2. Click `Add Folder…` and choose a working directory.
3. Hover over the folder and click `+` to create a terminal.
4. Create more terminals under the same folder to run multiple Claude CLI sessions or other command-line tasks in parallel.
5. Click a terminal name to switch to it in VS Code's central editor area.

## Remote SSH

TerminalFolder is declared as a workspace extension. In a Remote SSH window, directory validation and extension code run on the remote Extension Host, while VS Code creates and renders the native remote terminals.

TerminalFolder 被声明为 workspace extension。在 Remote SSH 窗口中，目录校验和扩展代码运行在远端 Extension Host，远程终端由 VS Code 原生创建和渲染。

## Settings / 设置

- `terminalFolder.shell`: Optional shell path. The system default is used when empty. / 可选 shell 路径，留空时使用系统默认值。
- `terminalFolder.shellArgs`: Arguments passed to the shell. / 传递给 shell 的参数。

字体、字号、主题、滚动缓冲区和 GPU 加速等显示选项直接使用 VS Code 的 `terminal.integrated.*` 设置。

Font, size, theme, scrollback, GPU acceleration, and other display options use VS Code's `terminal.integrated.*` settings directly.

## Development / 本地开发

Requires Node.js 22+ and VS Code 1.95+.

需要 Node.js 22+ 和 VS Code 1.95+。

```bash
npm install
npm run check
npm test
npm run build
```

Run `npm run package` to validate, test, build, and create a platform-specific VSIX. See [PUBLISHING.md](PUBLISHING.md) for the complete publishing process.

执行 `npm run package` 可完成校验、测试、构建并生成当前平台的 VSIX。完整发布流程见 [PUBLISHING.md](PUBLISHING.md)。
