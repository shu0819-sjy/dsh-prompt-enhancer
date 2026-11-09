'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function loadHelpers() {
  const source = require('../src/client/next-suggestion.js');
  const context = {};
  vm.runInNewContext(source + '\nthis.api = { validateNextSuggestion, suggestionCanAccept };', context);
  return context.api;
}

const { validateNextSuggestion, suggestionCanAccept } = loadHelpers();
const base = {
  enabled: true, suggestion: '核对实现并运行 focused tests', sessionId: 's1', activeSessionId: 's1',
  signature: 'sig-a', currentSignature: 'sig-a', draft: '', phase: 'plain', running: false,
  hasAttachments: false, hasQueuedMessages: false,
};

for (const [name, input, expected] of [
  ['valid JSON shape', { suggestion: '执行下一步测试' }, '执行下一步测试'],
  ['empty suggestion', { suggestion: '   ' }, ''],
  ['generic filler', { suggestion: '继续' }, ''],
  ['over length', { suggestion: 'x'.repeat(161) }, ''],
  ['wrong type', { suggestion: 1 }, ''],
]) test(`NEXT-PARSE ${name}`, () => assert.equal(validateNextSuggestion(input), expected));

test('NEXT-TAB accepts only safe empty plain composer', () => {
  assert.equal(suggestionCanAccept({ key: 'Tab', keyCode: 9 }, base, false), true);
  for (const patch of [
    { draft: 'typed' }, { sessionId: 's2' }, { currentSignature: 'sig-b' },
    { phase: 'submitting' }, { running: true }, { hasAttachments: true },
    { hasQueuedMessages: true },
  ]) assert.equal(suggestionCanAccept({ key: 'Tab', keyCode: 9 }, { ...base, ...patch }, false), false);
});

test('NEXT-TAB preserves native handling for modifiers, IME and menu', () => {
  for (const event of [
    { key: 'Enter' }, { key: 'Tab', ctrlKey: true }, { key: 'Tab', isComposing: true },
    { key: 'Tab', keyCode: 229 },
  ]) assert.equal(suggestionCanAccept(event, base, false), false);
  assert.equal(suggestionCanAccept({ key: 'Tab' }, base, true), false);
});
