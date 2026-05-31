const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTaskFailureText } = require("../dist/services/task/taskSupport.js");

const STRUCTURED_EMPTY_RESPONSE_ERROR = "[STRUCTURED_OUTPUT:transport_error] Cannot read properties of undefined (reading 'message')";

test("task visible failure text normalizes structured transport errors", () => {
  const text = normalizeTaskFailureText(STRUCTURED_EMPTY_RESPONSE_ERROR);

  assert.match(text, /模型返回了空响应/);
  assert.match(text, /授权可用的文本模型/);
  assert.doesNotMatch(text, /Cannot read properties/);
});
