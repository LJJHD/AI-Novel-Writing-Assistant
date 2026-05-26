import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";

export function resolveConnectivityProtocolCandidates(input: {
  provider: LLMProvider;
  preferred?: ModelRouteRequestProtocol;
}): ModelRouteRequestProtocol[] {
  if (input.preferred === "openai_compatible" || input.preferred === "anthropic") {
    return [input.preferred];
  }
  if (input.provider === "anthropic") {
    return ["anthropic", "openai_compatible"];
  }
  return ["openai_compatible"];
}
