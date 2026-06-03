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
    return "模型返回了空响应。请确认当前模型支持 OpenAI 兼容的聊天补全接口，并选择一个已在中转平台授权可用的文本模型后重试。";
  }

  return message || "连接测试失败。";
}
