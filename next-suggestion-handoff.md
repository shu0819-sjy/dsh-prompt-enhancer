# 交接：对话后续建议 + 受控 Tab 直发（compact）

状态日期：2026-11-08。目标：DSH 提示词增强插件新增「回复完成后预测下一步指令；按 Tab 采纳」。
保护边界：既有上下文遥测改动（src/host/enhance-handlers.js telemetry、plugin-host.js、src/client/helpers.js、
components/enhance-button.js 结果态 title、lib/client.cjs、test/personalization-context.test.cjs）不得回退。

## 已验证（运行态/命令级）
- `node scripts/build-host.mjs` + `--check` 通过（plugin-host.js 213361 bytes, v3.4.2）。
- `node scripts/build-client.mjs` + `--check` 通过（lib/client.cjs 330415 bytes）。
- `node scripts/sync-prompts.mjs --check`：未在本轮执行（待补）。
- `src/**/*.js` 全量 `node --check` 通过。
- 宿主接口证据：InputActions.submit() 存在于安装的 dsh-client-ui-conversation 类型定义。

## 已完成改动
- src/host/enhance-handlers.js：新增 `suggestion/next` handler（低优先级、独立超时 12s、
  只取最近 user+assistant 两条、1200/1600 字截断、maxTokens 180、不重试、不并入增强链）；
  系统提示要求严格 JSON、单条可发送指令、拒绝外部副作用假设、≤160 字。
- lib/rpc-schema.cjs：新增 `suggestion/next` schema（required: sessionId/requestId/signature/enabled）。
- src/client/next-suggestion.js（新 chunk）：NEXT_SUGGESTION_MAX_CHARS=160、NEXT_SUGGESTION_HINT、
  validateNextSuggestion、suggestionCanAccept（session/signature/draft/phase/running/附件/队列/菜单/IME/修饰键守卫）。
- src/client/state.js：cloneDefaults + sanitizeV2 增补 nextSuggestion{enabled:false,directSend:false}。
- scripts/build-client.mjs + src/client/skeleton.js：新增 next-suggestion 注入标记。
- src/client/components/enhance-button.js：useEffect 生成建议（requestId+signature 过期丢弃）、
  window keydown(capture) Tab 守卫，默认 setDraft 填充；directSend=true 时才 submit()。
- src/client/app.js：仅格式修复（外层字符串换行还原），无逻辑改动。

## 未完成（下一步）
1. 设置 UI 开关：nextSuggestion.enabled / nextSuggestion.directSend（当前仅有配置默认值与读取，无开关入口）。
2. 建议展示：当前无 UI 提示元素（NEXT_SUGGESTION_HINT 已定义但未渲染）。
3. 测试：新建 test/next-suggestion.test.cjs 覆盖生成与 JSON 解析、空建议、长度上限、超时/失败、
   会话切换、过期响应、用户输入保护、Tab 行为、发送链、Enter 原生行为。
4. 全量 `npm test`；`node scripts/build-host.mjs --check`、`build-client.mjs --check`、`sync-prompts.mjs --check`。
5. 真实页面验收：需空闲会话（此前 DSH 窗口处于生成中），区分静态通过/产物就绪/真实交互。

## 纪律
- 生成物 plugin-host.js / lib/client.cjs 只经构建脚本重建，不手改。
- src/** 的字符串字面量模块：内层换行必须写 \n，JSON 示例双引号必须写 \"；否则构建期 SyntaxError。
