const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTaskFailureText } = require("../dist/services/task/taskSupport.js");

const STRUCTURED_EMPTY_RESPONSE_ERROR = "[STRUCTURED_OUTPUT:transport_error] Cannot read properties of undefined (reading 'message')";

test("task visible failure text normalizes structured transport errors", () => {
  const text = normalizeTaskFailureText(STRUCTURED_EMPTY_RESPONSE_ERROR);

  assert.match(text, /没有拿到标准 OpenAI Chat Completion 消息/);
  assert.match(text, /API URL/);
  assert.match(text, /中转平台是否已授权/);
  assert.doesNotMatch(text, /Cannot read properties/);
});
