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

function extractGatewayErrorMessage(payload: unknown, fallbackText: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as {
      error?: unknown;
      message?: unknown;
      code?: unknown;
    };
    if (record.error && typeof record.error === "object") {
      const errorRecord = record.error as { message?: unknown; code?: unknown; type?: unknown };
      if (typeof errorRecord.message === "string" && errorRecord.message.trim()) {
        return errorRecord.message.trim();
      }
      if (typeof errorRecord.code === "string" && errorRecord.code.trim()) {
        return errorRecord.code.trim();
      }
      if (typeof errorRecord.type === "string" && errorRecord.type.trim()) {
        return errorRecord.type.trim();
      }
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.code === "string" && record.code.trim()) {
      return record.code.trim();
    }
  }
  return fallbackText.trim().slice(0, 500) || "未知错误";
}

function hasAssistantMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return false;
  }
  const message = (first as { message?: unknown }).message;
  return Boolean(message && typeof message === "object");
}

function describePayloadShape(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "响应不是 JSON 对象";
  }
  const record = payload as { choices?: unknown };
  const keys = Object.keys(record).slice(0, 8);
  const keySummary = keys.length > 0 ? `；顶层字段：${keys.join(", ")}` : "";
  if (!Array.isArray(record.choices)) {
    return `choices 缺失或不是数组${keySummary}`;
  }
  if (record.choices.length === 0) {
    return `choices 为空${keySummary}`;
  }
  const first = record.choices[0];
  if (!first || typeof first !== "object") {
    return `choices[0] 不是对象${keySummary}`;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return `choices[0].message 缺失或不是对象${keySummary}`;
  }
  return `choices[0].message 可用${keySummary}`;
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
  if (!hasAssistantMessage(payload)) {
    throw new Error(`${NON_STANDARD_CHAT_COMPLETION_MESSAGE}（HTTP ${response.status}，响应结构：${describePayloadShape(payload)}）。${NON_STANDARD_CHAT_COMPLETION_GUIDANCE}`);
  }
}
