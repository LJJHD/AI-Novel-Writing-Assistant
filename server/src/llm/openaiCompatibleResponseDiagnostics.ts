import type { LLMProvider } from "@ai-novel/shared/types/llm";

export type OpenAICompatibleDiagnosticFetch = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenAICompatibleDiagnosticEvent {
  event: "openai_compatible_response_shape";
  provider: LLMProvider;
  model: string;
  baseURL: string;
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  shape: string;
  gatewayError: string | null;
}

export interface OpenAICompatibleDiagnosticFetchInput {
  provider: LLMProvider;
  model: string;
  baseURL: string;
  fetchImpl?: OpenAICompatibleDiagnosticFetch;
  logEvent: (entry: OpenAICompatibleDiagnosticEvent) => void;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function shouldInspectChatCompletionResponse(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/u, "").endsWith("/chat/completions");
  } catch {
    return url.includes("/chat/completions");
  }
}

export function hasOpenAICompatibleAssistantMessage(payload: unknown): boolean {
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

export function describeOpenAICompatibleChatPayloadShape(payload: unknown): string {
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

export function extractGatewayErrorMessage(payload: unknown, fallbackText: string): string {
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

export function createOpenAICompatibleDiagnosticFetch(
  input: OpenAICompatibleDiagnosticFetchInput,
): OpenAICompatibleDiagnosticFetch {
  const fetchImpl = input.fetchImpl ?? fetch;
  return async (url, init) => {
    const response = await fetchImpl(url, init);
    const requestUrl = extractUrl(url);
    if (!shouldInspectChatCompletionResponse(requestUrl)) {
      return response;
    }

    try {
      const contentType = response.headers.get("content-type");
      if (response.ok && contentType?.toLowerCase().includes("text/event-stream")) {
        return response;
      }
      const responseText = await response.clone().text();
      const payload = safeParseJson(responseText);
      const shape = describeOpenAICompatibleChatPayloadShape(payload);
      if (response.ok && hasOpenAICompatibleAssistantMessage(payload)) {
        return response;
      }
      input.logEvent({
        event: "openai_compatible_response_shape",
        provider: input.provider,
        model: input.model,
        baseURL: input.baseURL,
        url: requestUrl,
        status: response.status,
        ok: response.ok,
        contentType,
        shape,
        gatewayError: response.ok ? null : extractGatewayErrorMessage(payload, responseText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.logEvent({
        event: "openai_compatible_response_shape",
        provider: input.provider,
        model: input.model,
        baseURL: input.baseURL,
        url: requestUrl,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type"),
        shape: `响应诊断读取失败：${message}`,
        gatewayError: null,
      });
    }

    return response;
  };
}
