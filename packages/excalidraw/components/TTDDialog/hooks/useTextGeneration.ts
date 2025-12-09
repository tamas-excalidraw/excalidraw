import { useCallback, useRef, useState } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { isFiniteNumber } from "@excalidraw/math";

import { trackEvent } from "../../../analytics";
import { t } from "../../../i18n";

import { useTTDContext } from "../TTDContext";

import type { ChatMessageType } from "../../Chat";

interface ThrottledFunction {
  (content: string): Promise<void>;
  flush: () => void;
  cancel: () => void;
}

interface UseTextGenerationProps {
  getMessagesForApi: () => Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  addMessage: (message: Omit<ChatMessageType, "id" | "timestamp">) => void;
  updateLastMessage: (
    updates: Partial<ChatMessageType>,
    type?: ChatMessageType["type"],
  ) => void;
  removeLastErrorMessage: () => void;
  renderMermaid: (mermaidDefinition: string) => Promise<boolean>;
  throttledRenderMermaid: ThrottledFunction;
  fastThrottledRenderMermaid: ThrottledFunction;
  shouldThrottleRef: React.MutableRefObject<boolean>;
  resetThrottleState: () => void;
}

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 1000;

export const useTextGeneration = ({
  getMessagesForApi,
  addMessage,
  updateLastMessage,
  removeLastErrorMessage,
  renderMermaid,
  throttledRenderMermaid,
  fastThrottledRenderMermaid,
  shouldThrottleRef,
  resetThrottleState,
}: UseTextGenerationProps) => {
  const {
    onTextSubmit,
    addUserAndPendingAssistant,
    setAssistantError,
    updateAssistantContent,
    setChatHistory,
    setTtdGeneration,
    setError,
    setShowPreview,
    saveCurrentChat,
    rateLimits,
    setRateLimits,
  } = useTTDContext();

  const [isGenerating, setIsGenerating] = useState(false);
  const accumulatedContentRef = useRef("");
  const streamingAbortControllerRef = useRef<AbortController | null>(null);

  const validatePrompt = useCallback(
    (prompt: string): boolean => {
      if (
        prompt.length > MAX_PROMPT_LENGTH ||
        prompt.length < MIN_PROMPT_LENGTH ||
        isGenerating ||
        rateLimits?.rateLimitRemaining === 0
      ) {
        if (prompt.length < MIN_PROMPT_LENGTH) {
          setError(
            new Error(
              t("chat.errors.promptTooShort", { min: MIN_PROMPT_LENGTH }),
            ),
          );
        }
        if (prompt.length > MAX_PROMPT_LENGTH) {
          setError(
            new Error(
              t("chat.errors.promptTooLong", { max: MAX_PROMPT_LENGTH }),
            ),
          );
        }

        return false;
      }
      return true;
    },
    [isGenerating, rateLimits?.rateLimitRemaining, setError],
  );

  const handleRateLimits = useCallback(
    (
      rateLimit: number | null | undefined,
      rateLimitRemaining: number | null | undefined,
    ) => {
      if (isFiniteNumber(rateLimit) && isFiniteNumber(rateLimitRemaining)) {
        const previousRemaining = rateLimits?.rateLimitRemaining ?? null;
        setRateLimits({ rateLimit, rateLimitRemaining });

        if (
          rateLimitRemaining === 0 &&
          previousRemaining !== null &&
          previousRemaining > 0
        ) {
          updateLastMessage(
            {
              isGenerating: false,
            },
            "assistant",
          );
          addMessage({
            type: "system",
            content: t("chat.rateLimit.message"),
          });
        }
      }
    },
    [rateLimits?.rateLimitRemaining, setRateLimits, updateLastMessage, addMessage],
  );

  const handleAbortedGeneration = useCallback(() => {
    const currentContent = accumulatedContentRef.current;
    if (currentContent) {
      setTtdGeneration((s) => ({
        generatedResponse: currentContent,
        prompt: s?.prompt ?? null,
        validMermaidContent: s?.validMermaidContent ?? null,
      }));
      updateLastMessage(
        {
          isGenerating: false,
          content: currentContent,
        },
        "assistant",
      );
      if (currentContent.trim()) {
        renderMermaid(currentContent);
      }
    } else {
      updateLastMessage(
        {
          isGenerating: false,
        },
        "assistant",
      );
    }
  }, [setTtdGeneration, updateLastMessage, renderMermaid]);

  const handleError = useCallback(
    (error: Error, errorType: "parse") => {
      const message: string | undefined = error.message;

      if (errorType === "parse") {
        trackEvent("ai", "mermaid parse failed", "ttd");
        updateLastMessage(
          {
            isGenerating: false,
            error: error.message,
            errorType: "parse",
          },
          "assistant",
        );
        setError(new Error(message));
      }
    },
    [updateLastMessage, setError],
  );

  const onGenerate = useCallback(
    async (promptWithContext: string, isRepairFlow: boolean = false) => {
      if (!validatePrompt(promptWithContext)) {
        return;
      }

      setTtdGeneration((s) => ({
        generatedResponse: s?.generatedResponse ?? null,
        prompt: s?.prompt ?? null,
        validMermaidContent: null,
      }));

      if (isRepairFlow) {
        addMessage({
          type: "assistant",
          content: "",
          isGenerating: true,
        });
      } else {
        addUserAndPendingAssistant(promptWithContext, addMessage);
      }

      accumulatedContentRef.current = "";
      resetThrottleState();

      setShowPreview(true);

      if (streamingAbortControllerRef.current) {
        streamingAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      streamingAbortControllerRef.current = abortController;

      try {
        setIsGenerating(true);

        trackEvent("ai", "generate", "ttd");

        const filteredMessages = getMessagesForApi();

        const { generatedResponse, error, rateLimit, rateLimitRemaining } =
          await onTextSubmit({
            messages: [
              ...filteredMessages,
              { role: "user", content: promptWithContext },
            ],
            onChunk: (chunk: string) => {
              updateAssistantContent(updateLastMessage, chunk);
              accumulatedContentRef.current += chunk;
              const content = accumulatedContentRef.current;

              if (shouldThrottleRef.current) {
                throttledRenderMermaid(content);
              } else {
                fastThrottledRenderMermaid(content);
              }
            },
            signal: abortController.signal,
          });

        throttledRenderMermaid.flush();
        fastThrottledRenderMermaid.flush();

        if (typeof generatedResponse === "string") {
          setTtdGeneration((s) => ({
            generatedResponse,
            prompt: s?.prompt ?? null,
            validMermaidContent: s?.validMermaidContent ?? null,
          }));

          accumulatedContentRef.current = generatedResponse;
        }

        handleRateLimits(rateLimit, rateLimitRemaining);

        if (error) {
          const isAborted =
            error.name === "AbortError" ||
            error.message === "Aborted" ||
            abortController.signal.aborted;

          if (isAborted) {
            handleAbortedGeneration();
            return;
          }

          if (
            error.message ===
            "Too many requests today, please try again tomorrow!"
          ) {
            setChatHistory((prev) => ({
              ...prev,
              messages: prev.messages.slice(0, -1),
            }));
          } else {
            setAssistantError(
              updateLastMessage,
              setError,
              error.message,
              "network",
            );
          }
          return;
        }

        updateLastMessage(
          {
            isGenerating: false,
            content: generatedResponse ?? "",
          },
          "assistant",
        );

        if (isRepairFlow) {
          removeLastErrorMessage();
        }

        saveCurrentChat();

        await parseMermaidToExcalidraw(generatedResponse ?? "");

        // do a final render, just to be sure
        renderMermaid(accumulatedContentRef.current);
        trackEvent("ai", "mermaid parse success", "ttd");
      } catch (error: unknown) {
        handleError(error as Error, "parse");
      } finally {
        setIsGenerating(false);
        streamingAbortControllerRef.current = null;
      }
    },
    [
      validatePrompt,
      setTtdGeneration,
      addMessage,
      addUserAndPendingAssistant,
      resetThrottleState,
      setShowPreview,
      getMessagesForApi,
      onTextSubmit,
      updateAssistantContent,
      updateLastMessage,
      shouldThrottleRef,
      throttledRenderMermaid,
      fastThrottledRenderMermaid,
      handleRateLimits,
      handleAbortedGeneration,
      setChatHistory,
      setAssistantError,
      setError,
      removeLastErrorMessage,
      saveCurrentChat,
      renderMermaid,
      handleError,
    ],
  );

  const handleAbort = useCallback(() => {
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }
  }, []);

  return {
    onGenerate,
    handleAbort,
    isGenerating,
    accumulatedContentRef,
  };
};
