'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const configSource = require(path.join(root, 'src/client/constants.js'));
const rawConfig = configSource.match(/const CONFIG_DEFAULTS = ([\s\S]*?);\r?\n\/\//);
assert.ok(rawConfig, 'CONFIG_DEFAULTS source found');
const defaults = new Function('return (' + rawConfig[1] + ')')();

test('personalization defaults on a bounded, context-aware mode without enabling memory', () => {
  assert.equal(defaults.mode, 'lite');
  assert.equal(defaults.context.budgetChars, 2000);
  assert.equal(defaults.memory, false);
});

test('base mode stays explicit opt-out and still has no context retrieval', () => {
  const pure = fs.readFileSync(path.join(root, 'src/host/pure.js'), 'utf8');
  assert.match(pure, /base: \{ phaseA: 'none', phaseB: 'none', phaseC: 'none', budgetDefault: 0/);
  assert.match(pure, /const DEFAULT_MODE = 'base'/);
  const clientState = fs.readFileSync(path.join(root, 'src/client/state.js'), 'utf8');
  assert.match(clientState, /mode: 'lite'/);
  assert.match(clientState, /budgetChars: 2000/);
  assert.match(pure, /const DEFAULT_MEMORY = false/);
});

test('base system template preserves intent and treats context as subordinate', () => {
  const system = fs.readFileSync(path.join(root, 'skills/enhance/base/system.md'), 'utf8');
  assert.match(system, /原文.*第一优先/);
  assert.match(system, /不得替换、扩大、缩小或颠倒/);
  assert.match(system, /当前草稿为准/);
});

test('incremental-output-completeness guard across enhance templates (anti semantic-gap)', () => {
  // lite/standard/smart：增量指令的产出必须是完整可独立使用/可交付的提示词，不得只输出增量差异
  const standard = fs.readFileSync(path.join(root, 'skills/enhance/standard/system.md'), 'utf8');
  assert.match(standard, /增量指令（如「继续完善」「加上 X」「补充 Y」）的产出必须是\*\*完整可独立使用的提示词\*\*/);
  assert.match(standard, /不得只输出增量差异、追加句或省略既有要素的缩略版/);
  const lite = fs.readFileSync(path.join(root, 'skills/enhance/lite/system.md'), 'utf8');
  assert.match(lite, /延续\/增量指令的产出须是完整可独立使用的提示词/);
  const smart = fs.readFileSync(path.join(root, 'skills/enhance/smart/system.md'), 'utf8');
  assert.match(smart, /增量指令的产出必须是完整可交付的开发规格/);
  // publish：多轮扩充规则已自带「每轮完整九章」，不重复加增量行——锚定其防缩略规则
  const publish = fs.readFileSync(path.join(root, 'skills/enhance/publish/system.md'), 'utf8');
  assert.match(publish, /每一轮都必须输出完整九章规格/);
  assert.match(publish, /不得输出精简版、摘要或仅回应补充/);
});

test('long-term memory is not wired as a direct service', () => {
  const host = fs.readFileSync(path.join(root, 'src/host/enhance-handlers.js'), 'utf8');
  assert.doesNotMatch(host, /ctx\.get\(['"]memory/);
  assert.doesNotMatch(host, /ctx\.get\(['"]memory_search/);
  assert.match(host, /summarizeSessionContext/);
  assert.match(host, /相关对话摘要/);
  assert.match(host, /summary-empty; context omitted/);
});

test('summary helper uses selected model with draft and history, and fails closed', async () => {
  const handlers = require(path.join(root, 'src/host/enhance-handlers.js'));
  const start = handlers.indexOf('    async function summarizeSessionContext');
  const end = handlers.indexOf('    async function judgeRelevance', start);
  assert.ok(start >= 0 && end > start, 'summary helper boundaries found');
  const helper = handlers.slice(start, end);
  const scopeNames = new Set();
  for (const match of handlers.slice(0, start).matchAll(/\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=/g)) scopeNames.add(match[1]);
  for (const name of ['RELEVANCE_TIMEOUT_MS', 'hlog', 'llm', 'ctx', 'collectStream']) scopeNames.add(name);
  const names = [...scopeNames];
  const buildHelper = (env) => new Function(...names,
    'return (async function(){' + helper + '; return summarizeSessionContext;})()')(...names.map((name) => env[name]));
  const goodEnv = {
    RELEVANCE_TIMEOUT_MS: 1000,
    hlog() {},
    llm: { stream(args) {
      globalThis.__summaryCall = args;
      return { async *[Symbol.asyncIterator]() {
        yield { type: 'text-delta', delta: 'Confirmed preference' };
        yield { type: 'finish', finishReason: 'stop' };
      } };
    } },
    ctx: { timer: { timeout() { return () => {}; } } },
    collectStream: async (iterator) => {
      let text = '';
      for await (const item of iterator) if (item.type === 'text-delta') text += item.delta;
      return { kind: 'ok', text };
    },
  };
  const summarize = await buildHelper(goodEnv);
  assert.equal(await summarize('history evidence', 'draft intent', { provider: 'selected-provider', model: 'selected-model' }), 'Confirmed preference');
  assert.equal(globalThis.__summaryCall.provider, 'selected-provider');
  assert.equal(globalThis.__summaryCall.model, 'selected-model');
  assert.match(globalThis.__summaryCall.system, /draft intent/);
  assert.match(globalThis.__summaryCall.system, /history evidence/);
  assert.equal(await summarize('', 'draft intent', { provider: 'p', model: 'm' }), '');
  assert.equal(await summarize('history evidence', 'draft intent', null), '');

  const failing = await buildHelper({ ...goodEnv, llm: { stream() { throw new Error('offline'); } } });
  assert.equal(await failing('history evidence', 'draft intent', { provider: 'p', model: 'm' }), '');

  let timeoutCallback;
  let returnedIterator = false;
  const hanging = await buildHelper({
    ...goodEnv,
    RELEVANCE_TIMEOUT_MS: 5,
    hlog() {},
    llm: { stream() { return { [Symbol.asyncIterator]() { return {
      next: () => new Promise(() => {}),
      return() { returnedIterator = true; return Promise.resolve({ done: true }); },
    }; } }; } },
    ctx: { timer: { timeout(fn) { timeoutCallback = fn; const handle = setTimeout(fn, 5); return () => clearTimeout(handle); } } },
    collectStream: async (iterator) => {
      while (true) {
        const next = await iterator.next();
        if (next.done) return { kind: 'cancelled' };
      }
    },
  });
  assert.equal(await hanging('history evidence', 'draft intent', { provider: 'p', model: 'm' }), '');
  assert.equal(returnedIterator, true, 'timeout requests iterator cleanup');
  void timeoutCallback;
});

test('判定流超时会清理挂起迭代器并及时返回', async () => {
  const handlers = require(path.join(root, 'src/host/enhance-handlers.js'));
  const start = handlers.indexOf('    async function collectStreamWithTimeout');
  const end = handlers.indexOf('    async function summarizeSessionContext', start);
  assert.ok(start >= 0 && end > start, 'timeout helper boundaries found');
  const helper = handlers.slice(start, end);
  let returned = false;
  let timerCallback;
  const timeoutHelper = await new Function('ctx', 'collectStream',
    'return (async function(){' + helper + '; return collectStreamWithTimeout;})()')(
      { timer: { timeout(fn) { timerCallback = fn; return () => {}; } } },
      async (iterator) => {
        await iterator.next();
        return { kind: 'ok', text: '' };
      },
    );
  const iterator = {
    next() { return new Promise(() => {}); },
    return() { returned = true; return Promise.resolve({ done: true }); },
  };
  const pending = timeoutHelper(iterator, 1200, 5);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(typeof timerCallback, 'function');
  timerCallback();
  const result = await pending;
  assert.equal(result.kind, 'timeout');
  assert.equal(returned, true, 'timeout requests iterator cleanup');
});

test('判定流清理本身挂起时仍及时返回超时', async () => {
  const handlers = require(path.join(root, 'src/host/enhance-handlers.js'));
  const start = handlers.indexOf('    async function collectStreamWithTimeout');
  const end = handlers.indexOf('    async function summarizeSessionContext', start);
  const helper = handlers.slice(start, end);
  let timerCallback;
  const timeoutHelper = await new Function('ctx', 'collectStream',
    'return (async function(){' + helper + '; return collectStreamWithTimeout;})()')(
      { timer: { timeout(fn) { timerCallback = fn; return () => {}; } } },
      async () => new Promise(() => {}),
    );
  const iterator = {
    next() { return new Promise(() => {}); },
    return() { return new Promise(() => {}); },
  };
  const pending = timeoutHelper(iterator, 1200, 5);
  await new Promise((resolve) => setTimeout(resolve, 10));
  timerCallback();
  const result = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 50)),
  ]);
  assert.equal(result.kind, 'timeout');
});

test('context telemetry is wired from host result to client store and enhance button tooltip', () => {
  const host = fs.readFileSync(path.join(root, 'plugin-host.js'), 'utf8');
  assert.match(host, /state\.telemetry\s*=\s*\{\s*summary:\s*summaryText/);
  assert.match(host, /summaryChars:\s*summaryText\.length/);
  assert.match(host, /budgetChars:\s*rbudget\.roundsChars/);
  assert.match(host, /injectedChars:\s*state\.v2Block\.length/);
  assert.match(host, /telemetry:\s*state\.telemetry/);

  const client = fs.readFileSync(path.join(root, 'lib/client.cjs'), 'utf8');
  assert.match(client, /telemetry:\s*null/);
  assert.match(client, /s\.telemetry\s*=\s*r\.telemetry/);
  assert.match(client, /【上下文总览摘要】/);
});
