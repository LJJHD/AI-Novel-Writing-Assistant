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

test("OpenAI-compatible diagnostic fetch returns true streaming chat responses without reading the stream", async () => {
  const entries = [];
  let closeStream = () => {};
  const diagnosticFetch = createOpenAICompatibleDiagnosticFetch({
    provider: "custom_aiport",
    model: "gpt-5.5",
    baseURL: "https://gateway.example.com/v1",
    logEvent: (entry) => entries.push(entry),
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n"));
        closeStream = () => controller.close();
      },
    }), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  });

  const responsePromise = diagnosticFetch("https://gateway.example.com/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ stream: true }),
  });
  const result = await Promise.race([
    responsePromise,
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
  ]);
  closeStream();
  await responsePromise.catch(() => {});

  assert.notEqual(result, "timeout");
  assert.equal(result.headers.get("content-type"), "text/event-stream");
  assert.equal(entries.length, 0);
});

test("OpenAI-compatible diagnostic fetch normalizes mislabeled non-stream JSON chat responses", async () => {
  const entries = [];
  const diagnosticFetch = createOpenAICompatibleDiagnosticFetch({
    provider: "custom_aiport",
    model: "gpt-5.5",
    baseURL: "https://gateway.example.com/v1",
    logEvent: (entry) => entries.push(entry),
    fetchImpl: async () => new Response(JSON.stringify({
      id: "chatcmpl-json",
      object: "chat.completion",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "{\"status\":\"ok\"}" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  });

  const response = await diagnosticFetch("https://gateway.example.com/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ stream: false }),
  });

  assert.equal(response.headers.get("content-type"), "application/json");
  assert.match(await response.text(), /chatcmpl-json/);
  assert.equal(entries.length, 0);
});
