import './sidebar.css';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface SidebarTerminal {
  readonly id: string;
  readonly name: string;
  readonly status: 'running' | 'exited';
  readonly exitCode?: number;
}

interface SidebarFolder {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly expanded: boolean;
  readonly terminals: SidebarTerminal[];
}

interface HostMessage {
  readonly type?: unknown;
  readonly folders?: unknown;
  readonly activeTerminalId?: unknown;
}

const vscode = acquireVsCodeApi();
const sidebar = requiredElement('sidebar');

let selectedKey: string | undefined;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message?.type !== 'render' || !Array.isArray(message.folders)) {
    return;
  }
  const folders = message.folders.filter(isSidebarFolder);
  const activeTerminalId =
    typeof message.activeTerminalId === 'string' ? message.activeTerminalId : undefined;
  render(folders, activeTerminalId);
});

sidebar.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const action = target.closest<HTMLElement>('[data-action]');
  if (!action) {
    return;
  }
  handleAction(action);
});

sidebar.addEventListener('contextmenu', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const row = target.closest<HTMLElement>('[data-row-kind]');
  if (!row) {
    return;
  }
  event.preventDefault();
  if (row.dataset.rowKind === 'folder' && row.dataset.folderId) {
    vscode.postMessage({ type: 'folderMenu', folderId: row.dataset.folderId });
  } else if (row.dataset.rowKind === 'terminal' && row.dataset.terminalId) {
    vscode.postMessage({ type: 'terminalMenu', terminalId: row.dataset.terminalId });
  }
});

sidebar.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const row = target.closest<HTMLElement>('[data-primary-action]');
  if (!row || target.closest('.row__action')) {
    return;
  }
  event.preventDefault();
  handlePrimaryAction(row);
});

vscode.postMessage({ type: 'ready' });

function render(folders: SidebarFolder[], activeTerminalId: string | undefined): void {
  const fragment = document.createDocumentFragment();
  const keys = new Set<string>();

  for (const folder of folders) {
    const folderKey = `folder:${folder.id}`;
    keys.add(folderKey);
    fragment.append(createFolderRow(folder, selectedKey === folderKey));

    if (!folder.expanded) {
      continue;
    }

    for (const terminal of folder.terminals) {
      const terminalKey = `terminal:${terminal.id}`;
      keys.add(terminalKey);
      fragment.append(
        createTerminalRow(
          terminal,
          folder.id,
          selectedKey === terminalKey || (!selectedKey && activeTerminalId === terminal.id)
        )
      );
    }
  }

  if (selectedKey && !keys.has(selectedKey)) {
    selectedKey = undefined;
  }
  sidebar.replaceChildren(fragment, createAddFolderRow());
}

function createFolderRow(folder: SidebarFolder, selected: boolean): HTMLElement {
  const row = document.createElement('div');
  row.className = `row row--folder${selected ? ' row--selected' : ''}`;
  row.tabIndex = 0;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-expanded', String(folder.expanded));
  row.title = folder.path;
  row.dataset.rowKind = 'folder';
  row.dataset.folderId = folder.id;
  row.dataset.primaryAction = 'toggleFolder';
  row.dataset.action = 'toggleFolder';

  const leading = document.createElement('span');
  leading.className = 'row__leading';
  leading.append(createIcon(folder.expanded ? 'folder-opened' : 'folder'));

  const label = document.createElement('span');
  label.className = 'row__label';
  label.textContent = folder.name;

  const actions = document.createElement('span');
  actions.className = 'row__actions';
  actions.append(
    createActionButton('more', 'Folder actions', 'folderMenu', { folderId: folder.id }),
    createActionButton('add', `New terminal in ${folder.name}`, 'addTerminal', {
      folderId: folder.id
    })
  );

  row.append(leading, label, actions);
  return row;
}

function createTerminalRow(
  terminal: SidebarTerminal,
  folderId: string,
  selected: boolean
): HTMLElement {
  const row = document.createElement('div');
  row.className = `row row--terminal${selected ? ' row--selected' : ''}`;
  row.tabIndex = 0;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', '2');
  row.title =
    terminal.status === 'running'
      ? `${terminal.name} — running`
      : `${terminal.name} — exited${terminal.exitCode === undefined ? '' : ` (${terminal.exitCode})`}`;
  row.dataset.rowKind = 'terminal';
  row.dataset.folderId = folderId;
  row.dataset.terminalId = terminal.id;
  row.dataset.primaryAction = 'selectTerminal';
  row.dataset.action = 'selectTerminal';

  const label = document.createElement('span');
  label.className = 'row__label';
  label.textContent = terminal.name;

  const actions = document.createElement('span');
  actions.className = 'row__actions';
  actions.append(
    createActionButton('more', 'Terminal actions', 'terminalMenu', {
      terminalId: terminal.id
    })
  );

  row.append(label, actions);
  return row;
}

function createAddFolderRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row row--add';
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.dataset.primaryAction = 'addFolder';
  row.dataset.action = 'addFolder';

  const leading = document.createElement('span');
  leading.className = 'row__leading';
  leading.append(createIcon('add'));

  const label = document.createElement('span');
  label.className = 'row__label';
  label.textContent = 'Add Folder…';
  row.append(leading, label);
  return row;
}

function createActionButton(
  icon: 'more' | 'add',
  title: string,
  action: string,
  data: { folderId?: string; terminalId?: string }
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'row__action';
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.dataset.action = action;
  if (data.folderId) {
    button.dataset.folderId = data.folderId;
  }
  if (data.terminalId) {
    button.dataset.terminalId = data.terminalId;
  }
  button.append(createIcon(icon));
  return button;
}

function handleAction(action: HTMLElement): void {
  const type = action.dataset.action;
  if (!type) {
    return;
  }
  if (type === 'toggleFolder' || type === 'selectTerminal') {
    const row = action.closest<HTMLElement>('[data-primary-action]') ?? action;
    handlePrimaryAction(row);
    return;
  }
  vscode.postMessage({
    type,
    folderId: action.dataset.folderId,
    terminalId: action.dataset.terminalId
  });
}

function handlePrimaryAction(row: HTMLElement): void {
  const type = row.dataset.primaryAction;
  if (!type) {
    return;
  }
  if (type === 'toggleFolder' && row.dataset.folderId) {
    selectedKey = `folder:${row.dataset.folderId}`;
  } else if (type === 'selectTerminal' && row.dataset.terminalId) {
    selectedKey = `terminal:${row.dataset.terminalId}`;
  }
  updateSelectedRow();
  vscode.postMessage({
    type,
    folderId: row.dataset.folderId,
    terminalId: row.dataset.terminalId
  });
}

function updateSelectedRow(): void {
  for (const row of sidebar.querySelectorAll<HTMLElement>('[data-row-kind]')) {
    const key =
      row.dataset.rowKind === 'folder'
        ? `folder:${row.dataset.folderId}`
        : `terminal:${row.dataset.terminalId}`;
    row.classList.toggle('row--selected', key === selectedKey);
  }
}

function createIcon(name: 'folder' | 'folder-opened' | 'add' | 'more'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  switch (name) {
    case 'folder':
      path.setAttribute('d', 'M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z');
      break;
    case 'folder-opened':
      path.setAttribute('d', 'M3.5 9V6.5a2 2 0 0 1 2-2h4l2 2h6.8a2 2 0 0 1 1.9 1.4M3.8 10.5h17.7l-2.7 7.2a2 2 0 0 1-1.9 1.3H5.5a2 2 0 0 1-1.9-2.6l2.1-5.9');
      break;
    case 'add':
      path.setAttribute('d', 'M12 5v14M5 12h14');
      break;
    case 'more':
      path.setAttribute('d', 'M6.5 12h.01M12 12h.01M17.5 12h.01');
      path.setAttribute('stroke-width', '3');
      break;
  }
  svg.append(path);
  return svg;
}

function isSidebarFolder(value: unknown): value is SidebarFolder {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SidebarFolder>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.expanded === 'boolean' &&
    Array.isArray(candidate.terminals) &&
    candidate.terminals.every(isSidebarTerminal)
  );
}

function isSidebarTerminal(value: unknown): value is SidebarTerminal {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SidebarTerminal>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.status === 'running' || candidate.status === 'exited')
  );
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}
