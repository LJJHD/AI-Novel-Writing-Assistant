function isEmptyOpenAIChatResponseError(message: string): boolean {
  return /Cannot read properties of undefined \(reading 'message'\)/.test(message);
}

export function normalizeConnectivityErrorMessage(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : typeof error === "string" && error.trim()
      ? error.trim()
      : "";

  if (isEmptyOpenAIChatResponseError(message)) {
    return "模型调用没有拿到标准 OpenAI Chat Completion 消息。请检查 API URL 是否指向 /v1 兼容接口、当前模型是否支持聊天补全、请求协议是否选为 OpenAI 兼容，以及中转平台是否已授权该文本模型。";
  }

  return message || "连接测试失败。";
}
