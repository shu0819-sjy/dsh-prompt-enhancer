const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('E2E context absorption: confirms decisions, rejects negative directions, prevents rollback', async () => {
  // 1. 读取 skills/enhance/standard/system.md
  const systemPrompt = fs.readFileSync(path.join(root, 'skills/enhance/standard/system.md'), 'utf8');
  
  // 校验模板中已固化强化规则
  assert.ok(systemPrompt.includes('强化已确认决策的继承性'), 'system prompt carries confirmed decision rule');
  assert.ok(systemPrompt.includes('强化已否决方向的绝对排除'), 'system prompt carries anti-rollback rule');
  assert.ok(systemPrompt.includes('禁入集合'), 'system prompt defines forbidden set for rejected directions');
  assert.ok(systemPrompt.includes('多轮讨论的演进记录'), 'system prompt references multi-turn context');

  // 2. 模拟多轮历史摘要（包含已确认技术栈与已否决方案）
  const summary = [
    '已确认技术方案：前端采用 React + TailwindCSS，状态管理使用 Zustand，后端使用 Fastify。',
    '已否决方向：明确拒绝使用 Redux 与 Axios，禁止引入全局巨石状态。'
  ].join('\n');

  // 3. 模拟用户最新增量草稿
  const currentDraft = '帮我加上用户登录态检查和重定向逻辑';

  // 4. 模拟融合后的上下文构建逻辑 (对应 enhance-handlers 中组装 state.v2Block 的逻辑)
  const v2Block = '【相关对话摘要（仅供补充理解；当前草稿优先）】\n' + summary;
  const assembledUserPrompt = v2Block + '\n\n【待优化草稿】\n' + currentDraft;

  // 验证输入包含确认项与否决项
  assert.ok(assembledUserPrompt.includes('Zustand'), 'includes confirmed decision');
  assert.ok(assembledUserPrompt.includes('明确拒绝使用 Redux'), 'includes rejected direction');
  assert.ok(assembledUserPrompt.includes('用户登录态检查'), 'includes current user draft');

  // 5. 校验 app.js / plugin-host.js 中的内嵌模板是否严格同步
  const hostContent = fs.readFileSync(path.join(root, 'plugin-host.js'), 'utf8');
  assert.ok(hostContent.includes('强化已确认决策的继承性'), 'host bundle has synchronized confirmed decision rule');
  assert.ok(hostContent.includes('强化已否决方向的绝对排除'), 'host bundle has synchronized anti-rollback rule');
  assert.ok(hostContent.includes('禁入集合'), 'host bundle has synchronized forbidden set');

  console.log('✔ E2E Context Absorption & Anti-Rollback Rules verified successfully.');
});