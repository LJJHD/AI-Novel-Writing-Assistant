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
const {
  createOpenAICompatibleDiagnosticFetch,
} = require("../dist/llm/openaiCompatibleResponseDiagnostics.js");

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
    /没有拿到标准 OpenAI Chat Completion 消息/,
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
    /choices 为空/,
  );
});

test("OpenAI-compatible diagnostic fetch logs malformed chat completion shapes", async () => {
  const entries = [];
  const diagnosticFetch = createOpenAICompatibleDiagnosticFetch({
    provider: "custom_aiport",
    model: "gpt-5.5",
    baseURL: "https://gateway.example.com/v1",
    logEvent: (entry) => entries.push(entry),
    fetchImpl: async () => new Response(JSON.stringify({
      id: "chatcmpl-empty",
      choices: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  const response = await diagnosticFetch("https://gateway.example.com/v1/chat/completions", {
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "openai_compatible_response_shape");
  assert.equal(entries[0].provider, "custom_aiport");
  assert.equal(entries[0].model, "gpt-5.5");
  assert.match(entries[0].shape, /choices 为空/);
});

test("OpenAI-compatible diagnostic fetch ignores successful event streams", async () => {
  const entries = [];
  const diagnosticFetch = createOpenAICompatibleDiagnosticFetch({
    provider: "custom_aiport",
    model: "gpt-5.5",
    baseURL: "https://gateway.example.com/v1",
    logEvent: (entry) => entries.push(entry),
    fetchImpl: async () => new Response("data: {}\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  });

  await diagnosticFetch("https://gateway.example.com/v1/chat/completions", {
    method: "POST",
  });

  assert.equal(entries.length, 0);
});
