const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveConnectivityProtocolCandidates,
} = require("../dist/llm/protocolCandidates.js");
const {
  normalizeConnectivityErrorMessage,
} = require("../dist/llm/connectivityError.js");
const {
  probeOpenAICompatibleChat,
} = require("../dist/llm/openaiCompatibleProbe.js");

test("custom providers default connectivity probes to OpenAI-compatible protocol", () => {
  assert.deepEqual(
    resolveConnectivityProtocolCandidates({
      provider: "custom_aiport",
    }),
    ["openai_compatible"],
  );
  assert.deepEqual(
    resolveConnectivityProtocolCandidates({
      provider: "custom_aiport",
      preferred: "auto",
    }),
    ["openai_compatible"],
  );
});

test("custom providers can still explicitly test Anthropic protocol", () => {
  assert.deepEqual(
    resolveConnectivityProtocolCandidates({
      provider: "custom_aiport",
      preferred: "anthropic",
    }),
    ["anthropic"],
  );
});

test("empty OpenAI-compatible chat responses are reported as provider response failures", () => {
  assert.match(
    normalizeConnectivityErrorMessage(
      new TypeError("Cannot read properties of undefined (reading 'message')"),
    ),
    /模型返回了空响应/,
  );
});

test("OpenAI-compatible probes preserve gateway top-level error messages", async () => {
  await assert.rejects(
    () => probeOpenAICompatibleChat({
      apiKey: "test-key",
      baseURL: "https://gateway.example.com/v1",
      model: "gpt-5.5",
      fetchImpl: async () => new Response(JSON.stringify({
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient account balance",
      }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    }),
    /Insufficient account balance/,
  );
});

test("OpenAI-compatible probes reject empty choices with an actionable message", async () => {
  await assert.rejects(
    () => probeOpenAICompatibleChat({
      apiKey: "test-key",
      baseURL: "https://gateway.example.com/v1",
      model: "gpt-5.5",
      fetchImpl: async () => new Response(JSON.stringify({
        id: "chatcmpl-empty",
        choices: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    }),
    /模型返回了空响应/,
  );
});
