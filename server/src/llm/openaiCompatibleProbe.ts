import {
  describeOpenAICompatibleChatPayloadShape,
  extractGatewayErrorMessage,
  hasOpenAICompatibleAssistantMessage,
} from "./openaiCompatibleResponseDiagnostics";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const NON_STANDARD_CHAT_COMPLETION_MESSAGE = "模型调用没有拿到标准 OpenAI Chat Completion 消息";
const NON_STANDARD_CHAT_COMPLETION_GUIDANCE = "请检查 API URL 是否指向 /v1 兼容接口、当前模型是否支持聊天补全、请求协议是否选为 OpenAI 兼容，以及中转平台是否已授权该文本模型。";

interface OpenAICompatibleProbeInput {
  apiKey?: string;
  baseURL: string;
  model: string;
  maxTokens?: number;
  fetchImpl?: FetchLike;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/u, "");
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function probeOpenAICompatibleChat(input: OpenAICompatibleProbeInput): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${normalizeBaseURL(input.baseURL)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "user", content: "请只回复 ok" }],
      max_tokens: input.maxTokens ?? 16,
      stream: false,
    }),
  });
  const responseText = await response.text();
  const payload = safeParseJson(responseText);
  if (!response.ok) {
    throw new Error(`OpenAI 兼容请求失败（${response.status}）：${extractGatewayErrorMessage(payload, responseText)}`);
  }
  if (!hasOpenAICompatibleAssistantMessage(payload)) {
    throw new Error(`${NON_STANDARD_CHAT_COMPLETION_MESSAGE}（HTTP ${response.status}，响应结构：${describeOpenAICompatibleChatPayloadShape(payload)}）。${NON_STANDARD_CHAT_COMPLETION_GUIDANCE}`);
  }
}
