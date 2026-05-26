const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveConnectivityProtocolCandidates,
} = require("../dist/llm/protocolCandidates.js");

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
