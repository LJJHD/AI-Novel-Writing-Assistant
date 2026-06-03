type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

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
    throw new Error("模型返回了空响应。请确认当前模型支持 OpenAI 兼容的聊天补全接口，并选择一个已在中转平台授权可用的文本模型后重试。");
  }
}
