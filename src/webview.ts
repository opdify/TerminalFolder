import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { consumeClipboardShortcut } from './clipboard';
import {
  defaultTerminalAppearance,
  normalizeTerminalAppearance,
  type TerminalAppearance
} from './terminalAppearance';
import './webview.css';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface TerminalInfo {
  readonly id: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly name: string;
  readonly status: 'running' | 'exited';
  readonly exitCode?: number;
  readonly history: string;
}

interface WebTerminal {
  info: TerminalInfo;
  readonly terminal: Terminal;
  readonly fit: FitAddon;
  readonly container: HTMLDivElement;
  webgl?: WebglAddon;
  opened: boolean;
}

interface HostMessage {
  readonly type?: string;
  readonly terminals?: TerminalInfo[];
  readonly terminal?: TerminalInfo;
  readonly terminalId?: string;
  readonly activeId?: string;
  readonly data?: string;
  readonly exitCode?: number;
  readonly scrollback?: number;
  readonly appearance?: unknown;
}

const vscode = acquireVsCodeApi();
const title = requiredElement('title');
const status = requiredElement('status');
const terminalHost = requiredElement('terminal-host');
const emptyState = requiredElement('empty');
const sessions = new Map<string, WebTerminal>();
const queuedMessages: HostMessage[] = [];
let activeId: string | undefined;
let initialized = false;
let scrollback = 5000;
let resizeFrame: number | undefined;
let appearance = defaultTerminalAppearance(terminalFontFamily());

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return;
  }

  if (!initialized && message.type !== 'initialize') {
    queuedMessages.push(message);
    return;
  }

  handleMessage(message);
});

new ResizeObserver(() => scheduleFit()).observe(terminalHost);
void document.fonts.ready.then(() => scheduleFit());
document.fonts.addEventListener('loadingdone', () => scheduleFit());
new MutationObserver(() => refreshTerminalThemes()).observe(document.body, {
  attributes: true,
  attributeFilter: ['class', 'style']
});

window.addEventListener('focus', () => {
  const session = activeId ? sessions.get(activeId) : undefined;
  session?.terminal.focus();
});

vscode.postMessage({ type: 'ready' });

function handleMessage(message: HostMessage): void {
  switch (message.type) {
    case 'initialize': {
      scrollback = clampScrollback(message.scrollback);
      appearance = normalizeTerminalAppearance(message.appearance, terminalFontFamily());
      for (const session of sessions.values()) {
        session.terminal.dispose();
        session.container.remove();
      }
      sessions.clear();

      for (const info of message.terminals ?? []) {
        ensureSession(info);
      }
      initialized = true;
      showSession(message.activeId);

      for (const queued of queuedMessages.splice(0)) {
        handleMessage(queued);
      }
      break;
    }
    case 'appearance':
      applyTerminalAppearance(message.appearance);
      break;
    case 'created':
    case 'renamed':
      if (isTerminalInfo(message.terminal)) {
        ensureSession(message.terminal);
        if (message.type === 'renamed' && activeId === message.terminal.id) {
          updateHeader(sessions.get(message.terminal.id));
        }
      }
      break;
    case 'select':
      if (isTerminalInfo(message.terminal)) {
        ensureSession(message.terminal);
        showSession(message.terminal.id);
      }
      break;
    case 'selectionChanged':
      showSession(typeof message.terminalId === 'string' ? message.terminalId : undefined);
      break;
    case 'output':
      if (typeof message.terminalId === 'string' && typeof message.data === 'string') {
        sessions.get(message.terminalId)?.terminal.write(message.data);
      }
      break;
    case 'exited': {
      if (typeof message.terminalId !== 'string') {
        break;
      }
      const session = sessions.get(message.terminalId);
      if (session) {
        session.info = {
          ...session.info,
          status: 'exited',
          exitCode: typeof message.exitCode === 'number' ? message.exitCode : undefined
        };
        if (activeId === session.info.id) {
          updateHeader(session);
        }
      }
      break;
    }
    case 'removed':
      if (typeof message.terminalId === 'string') {
        removeSession(message.terminalId);
      }
      break;
  }
}

function ensureSession(info: TerminalInfo): WebTerminal {
  const existing = sessions.get(info.id);
  if (existing) {
    existing.info = { ...info, history: existing.info.history };
    return existing;
  }

  const container = document.createElement('div');
  container.className = 'terminal-instance';
  container.dataset.terminalId = info.id;
  container.setAttribute('aria-label', `${info.folderName} / ${info.name}`);
  terminalHost.append(container);

  const terminal = new Terminal({
    // The Unicode 11 width provider is exposed through xterm's proposed API.
    allowProposedApi: true,
    allowTransparency: true,
    cursorBlink: true,
    cursorStyle: 'block',
    convertEol: false,
    drawBoldTextInBrightColors: true,
    customGlyphs: true,
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    fontWeight: appearance.fontWeight,
    fontWeightBold: appearance.fontWeightBold,
    letterSpacing: appearance.letterSpacing,
    lineHeight: appearance.lineHeight,
    minimumContrastRatio: appearance.minimumContrastRatio,
    scrollback,
    theme: terminalTheme()
  });
  const fit = new FitAddon();
  const unicode11 = new Unicode11Addon();
  terminal.loadAddon(fit);
  terminal.loadAddon(unicode11);
  terminal.unicode.activeVersion = '11';

  const session: WebTerminal = { info, terminal, fit, container, opened: false };
  sessions.set(info.id, session);

  terminal.onData((data) => {
    if (activeId === info.id && session.info.status === 'running') {
      vscode.postMessage({ type: 'input', terminalId: info.id, data });
    }
  });
  terminal.onResize(({ cols, rows }) => {
    if (activeId === info.id) {
      vscode.postMessage({ type: 'resize', cols, rows });
    }
  });
  terminal.attachCustomKeyEventHandler((event) => handleClipboardShortcut(event, session));
  container.addEventListener('contextmenu', (event) => handleContextMenu(event, session));

  if (info.history) {
    terminal.write(info.history);
  }
  return session;
}

function showSession(id: string | undefined): void {
  if (activeId) {
    sessions.get(activeId)?.container.classList.remove('terminal-instance--active');
  }

  const session = id ? sessions.get(id) : undefined;
  if (!session) {
    activeId = undefined;
    terminalHost.classList.add('terminal-host--empty');
    emptyState.classList.add('empty-state--visible');
    title.textContent = 'Terminal Projects';
    status.textContent = '';
    return;
  }

  activeId = session.info.id;
  terminalHost.classList.remove('terminal-host--empty');
  emptyState.classList.remove('empty-state--visible');
  session.container.classList.add('terminal-instance--active');
  updateHeader(session);

  if (!session.opened) {
    session.terminal.open(session.container);
    session.opened = true;
    enableWebglRenderer(session);
  }
  scheduleFit(true);
}

function enableWebglRenderer(session: WebTerminal): void {
  if (appearance.gpuAcceleration === 'off') {
    return;
  }
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      session.webgl = undefined;
    });
    session.terminal.loadAddon(webgl);
    session.webgl = webgl;
  } catch {
    // Software-only and remote environments can fall back to xterm's DOM renderer.
  }
}

function applyTerminalAppearance(value: unknown): void {
  appearance = normalizeTerminalAppearance(value, terminalFontFamily());
  for (const session of sessions.values()) {
    session.terminal.options.fontFamily = appearance.fontFamily;
    session.terminal.options.fontSize = appearance.fontSize;
    session.terminal.options.fontWeight = appearance.fontWeight;
    session.terminal.options.fontWeightBold = appearance.fontWeightBold;
    session.terminal.options.letterSpacing = appearance.letterSpacing;
    session.terminal.options.lineHeight = appearance.lineHeight;
    session.terminal.options.minimumContrastRatio = appearance.minimumContrastRatio;

    if (appearance.gpuAcceleration === 'off' && session.webgl) {
      session.webgl.dispose();
      session.webgl = undefined;
    } else if (appearance.gpuAcceleration !== 'off' && session.opened && !session.webgl) {
      enableWebglRenderer(session);
    }
  }
  scheduleFit();
}

function removeSession(id: string): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  session.terminal.dispose();
  session.container.remove();
  sessions.delete(id);
  if (activeId === id) {
    showSession(undefined);
  }
}

function updateHeader(session: WebTerminal | undefined): void {
  if (!session) {
    return;
  }
  title.textContent = `${session.info.folderName} / ${session.info.name}`;
  if (session.info.status === 'exited') {
    status.textContent = `Exited${session.info.exitCode === undefined ? '' : ` (${session.info.exitCode})`}`;
    status.className = 'surface__status surface__status--exited';
  } else {
    status.textContent = 'Running';
    status.className = 'surface__status surface__status--running';
  }
}

function scheduleFit(focus = false): void {
  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    const session = activeId ? sessions.get(activeId) : undefined;
    if (!session?.opened || terminalHost.clientWidth < 2 || terminalHost.clientHeight < 2) {
      return;
    }
    try {
      session.fit.fit();
      if (focus) {
        session.terminal.focus();
      }
    } catch {
      // The panel can become hidden between measurement and rendering.
    }
  });
}

function handleClipboardShortcut(event: KeyboardEvent, session: WebTerminal): boolean {
  const action = consumeClipboardShortcut(
    event,
    session.terminal.hasSelection(),
    session.info.status === 'running'
  );
  if (action === 'copy') {
    void navigator.clipboard.writeText(session.terminal.getSelection());
    return false;
  }
  if (action === 'paste') {
    void navigator.clipboard.readText().then((text) => session.terminal.paste(text));
    return false;
  }
  return true;
}

function handleContextMenu(event: MouseEvent, session: WebTerminal): void {
  event.preventDefault();
  if (session.terminal.hasSelection()) {
    void navigator.clipboard.writeText(session.terminal.getSelection());
    session.terminal.clearSelection();
  } else if (session.info.status === 'running') {
    void navigator.clipboard.readText().then((text) => session.terminal.paste(text));
  }
}

function terminalTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    background: color('--vscode-editor-background', '#1e1e1e'),
    foreground: color('--vscode-terminal-foreground', '#cccccc'),
    cursor: color('--vscode-terminalCursor-foreground', '#ffffff'),
    cursorAccent: color('--vscode-terminalCursor-background', '#000000'),
    selectionBackground: color('--vscode-terminal-selectionBackground', '#ffffff40'),
    selectionInactiveBackground: color(
      '--vscode-terminal-inactiveSelectionBackground',
      '#ffffff20'
    ),
    black: color('--vscode-terminal-ansiBlack', '#000000'),
    red: color('--vscode-terminal-ansiRed', '#cd3131'),
    green: color('--vscode-terminal-ansiGreen', '#0dbc79'),
    yellow: color('--vscode-terminal-ansiYellow', '#e5e510'),
    blue: color('--vscode-terminal-ansiBlue', '#2472c8'),
    magenta: color('--vscode-terminal-ansiMagenta', '#bc3fbc'),
    cyan: color('--vscode-terminal-ansiCyan', '#11a8cd'),
    white: color('--vscode-terminal-ansiWhite', '#e5e5e5'),
    brightBlack: color('--vscode-terminal-ansiBrightBlack', '#666666'),
    brightRed: color('--vscode-terminal-ansiBrightRed', '#f14c4c'),
    brightGreen: color('--vscode-terminal-ansiBrightGreen', '#23d18b'),
    brightYellow: color('--vscode-terminal-ansiBrightYellow', '#f5f543'),
    brightBlue: color('--vscode-terminal-ansiBrightBlue', '#3b8eea'),
    brightMagenta: color('--vscode-terminal-ansiBrightMagenta', '#d670d6'),
    brightCyan: color('--vscode-terminal-ansiBrightCyan', '#29b8db'),
    brightWhite: color('--vscode-terminal-ansiBrightWhite', '#e5e5e5')
  };
}

function refreshTerminalThemes(): void {
  const theme = terminalTheme();
  for (const session of sessions.values()) {
    session.terminal.options.theme = theme;
  }
}

function terminalFontFamily(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-font-family')
      .trim() || 'monospace'
  );
}

function clampScrollback(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 5000;
  }
  return Math.max(100, Math.min(100000, Math.floor(value ?? 5000)));
}

function isTerminalInfo(value: unknown): value is TerminalInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<TerminalInfo>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.folderId === 'string' &&
    typeof candidate.folderName === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.status === 'running' || candidate.status === 'exited') &&
    typeof candidate.history === 'string'
  );
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}
