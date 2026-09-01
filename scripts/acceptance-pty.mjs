import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import pty from 'node-pty';
import killTree from 'tree-kill';

const timeoutMs = 7000;
const testRoot = await mkdtemp(path.join(os.tmpdir(), 'terminal-projects-acceptance-'));
const projectA = path.join(testRoot, 'project-a');
const projectB = path.join(testRoot, 'project-b');
await mkdir(path.join(projectA, 'subdir'), { recursive: true });
await mkdir(projectB, { recursive: true });

const sessions = [];
const checks = [];

try {
  const a1 = createSession(projectA);
  const a2 = createSession(projectA);
  const b1 = createSession(projectB);
  sessions.push(a1, a2, b1);

  a1.write(`printf '__TP_%s__:%s:__END__\\n' 'CWD_A1' "$PWD"\r`);
  a2.write(`printf '__TP_%s__:%s:__END__\\n' 'CWD_A2' "$PWD"\r`);
  b1.write(`printf '__TP_%s__:%s:__END__\\n' 'CWD_B1' "$PWD"\r`);
  assert.match(await a1.waitFor(`__TP_CWD_A1__:${projectA}:__END__`), new RegExp(escapeRegExp(projectA)));
  assert.match(await a2.waitFor(`__TP_CWD_A2__:${projectA}:__END__`), new RegExp(escapeRegExp(projectA)));
  assert.match(await b1.waitFor(`__TP_CWD_B1__:${projectB}:__END__`), new RegExp(escapeRegExp(projectB)));
  checks.push('independent cwd');

  a1.write(`cd subdir; printf '__TP_%s__:%s:__END__\\n' 'CHANGED_A1' "$PWD"\r`);
  a2.write(`printf '__TP_%s__:%s:__END__\\n' 'UNCHANGED_A2' "$PWD"\r`);
  assert.match(
    await a1.waitFor(`__TP_CHANGED_A1__:${path.join(projectA, 'subdir')}:__END__`),
    new RegExp(escapeRegExp(path.join(projectA, 'subdir')))
  );
  assert.match(
    await a2.waitFor(`__TP_UNCHANGED_A2__:${projectA}:__END__`),
    new RegExp(escapeRegExp(projectA))
  );
  checks.push('independent shell state');

  a1.write(`for i in 1 2 3 4 5; do printf '__TP_BG_%s__\\n' "$i"; sleep .15; done\r`);
  b1.write(`printf '__TP_%s__\\n' 'FOREGROUND_B1'\r`);
  await b1.waitFor('__TP_FOREGROUND_B1__');
  await a1.waitFor('__TP_BG_5__');
  assert.equal(b1.output.includes('__TP_BG_5__'), false);
  assert.equal(a1.output.includes('__TP_FOREGROUND_B1__'), false);
  checks.push('background output and stream isolation');

  a1.resize(132, 43);
  a1.write(`printf '__TP_%s__:%s:__END__\\n' 'SIZE' "$(stty size)"\r`);
  assert.match(await a1.waitFor('__TP_SIZE__:43 132:__END__'), /__TP_SIZE__:43 132:__END__/);
  checks.push('pty resize');

  a1.write(`printf '\\033[31m__TP_%s__\\033[0m__TP_%s__\\n' 'ANSI' 'ANSI_END'\r`);
  assert.match(await a1.waitFor('__TP_ANSI_END__'), /\u001b\[31m__TP_ANSI__\u001b\[0m/);
  checks.push('ansi passthrough');

  a1.write('sleep 100000\r');
  await delay(200);
  a1.write('\x03');
  a1.write(`printf '__TP_%s__\\n' 'INTERRUPTED'\r`);
  await a1.waitFor('__TP_INTERRUPTED__');
  checks.push('Ctrl+C');

  b1.write('exit 7\r');
  assert.equal(await b1.waitForExit(), 7);
  checks.push('natural exit detection');

  a2.write('sleep 100000\r');
  await delay(250);
  const childPid = Number(
    execFileSync('pgrep', ['-P', String(a2.pid)], { encoding: 'utf8' })
      .trim()
      .split(/\s+/)[0]
  );
  assert.ok(Number.isInteger(childPid) && childPid > 1);
  await terminateTree(a2);
  await delay(300);
  assert.equal(isAlive(childPid), false);
  checks.push('kill process tree');

  a1.write('exit 0\r');
  assert.equal(await a1.waitForExit(), 0);

  console.log(
    JSON.stringify(
      {
        result: 'passed',
        hostname: os.hostname(),
        platform: `${process.platform}-${process.arch}`,
        node: process.version,
        checks
      },
      null,
      2
    )
  );
} finally {
  for (const session of sessions) {
    if (isAlive(session.pid)) {
      await terminateTree(session);
    }
  }
  await rm(testRoot, { recursive: true, force: true });
}

function createSession(cwd) {
  const handle = pty.spawn('/bin/bash', ['--noprofile', '--norc'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  });
  let output = '';
  let exitCode;
  const waiters = new Set();
  const exitWaiters = new Set();

  handle.onData((data) => {
    output += data;
    for (const waiter of waiters) {
      if (output.includes(waiter.marker)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(output);
      }
    }
  });
  handle.onExit((event) => {
    exitCode = event.exitCode;
    for (const waiter of exitWaiters) {
      clearTimeout(waiter.timer);
      exitWaiters.delete(waiter);
      waiter.resolve(exitCode);
    }
  });

  return {
    get pid() {
      return handle.pid;
    },
    get output() {
      return output;
    },
    write(data) {
      handle.write(data);
    },
    resize(cols, rows) {
      handle.resize(cols, rows);
    },
    kill() {
      handle.kill();
    },
    waitFor(marker) {
      if (output.includes(marker)) {
        return Promise.resolve(output);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          marker,
          resolve,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error(`Timed out waiting for ${marker}. Output: ${JSON.stringify(output.slice(-1000))}`));
          }, timeoutMs)
        };
        waiters.add(waiter);
      });
    },
    waitForExit() {
      if (exitCode !== undefined) {
        return Promise.resolve(exitCode);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          timer: setTimeout(() => {
            exitWaiters.delete(waiter);
            reject(new Error(`Timed out waiting for PTY ${handle.pid} to exit.`));
          }, timeoutMs)
        };
        exitWaiters.add(waiter);
      });
    }
  };
}

async function terminateTree(session) {
  if (process.platform !== 'win32') {
    try {
      process.kill(-session.pid, 'SIGHUP');
    } catch {}
  }
  await new Promise((resolve) => killTree(session.pid, 'SIGHUP', () => resolve()));
  try {
    session.kill();
  } catch {}
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
