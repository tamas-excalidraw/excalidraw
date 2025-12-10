import { useRef, useState } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { isFiniteNumber } from "@excalidraw/math";
import { useAtom } from "../../../editor-jotai";

import { trackEvent } from "../../../analytics";
import { t } from "../../../i18n";

import {
  errorAtom,
  showPreviewAtom,
  rateLimitsAtom,
  ttdGenerationAtom,
} from "../TTDContext";
import { chatHistoryAtom } from "../../Chat/useChatAgent";
import { useChatAgent } from "../../Chat";
import { useTTDChatStorage } from "../useTTDChatStorage";

import type { ChatMessageType } from "../../Chat";
import type { TTDPayload, OnTestSubmitRetValue } from "../types";

interface ThrottledFunction {
  (content: string): Promise<void>;
  flush: () => Promise<void>;
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
  resetThrottleState: () => void;
}

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 10000;

interface UseTextGenerationFullProps extends UseTextGenerationProps {
  onTextSubmit: (payload: TTDPayload) => Promise<OnTestSubmitRetValue>;
}

export const useTextGeneration = ({
  getMessagesForApi,
  addMessage,
  updateLastMessage,
  removeLastErrorMessage,
  renderMermaid,
  throttledRenderMermaid,
  resetThrottleState,
  onTextSubmit,
}: UseTextGenerationFullProps) => {
  const [, setError] = useAtom(errorAtom);
  const [, setShowPreview] = useAtom(showPreviewAtom);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);
  const [, setTtdGeneration] = useAtom(ttdGenerationAtom);
  const [, setChatHistory] = useAtom(chatHistoryAtom);

  const {
    addUserAndPendingAssistant,
    setAssistantError,
    updateAssistantContent,
  } = useChatAgent();

  const { saveCurrentChat } = useTTDChatStorage();

  const [isGenerating, setIsGenerating] = useState(false);
  const accumulatedContentRef = useRef("");
  const streamingAbortControllerRef = useRef<AbortController | null>(null);

  const validatePrompt = (prompt: string): boolean => {
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
          new Error(t("chat.errors.promptTooLong", { max: MAX_PROMPT_LENGTH })),
        );
      }

      return false;
    }
    return true;
  };

  const handleRateLimits = (
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
  };

  const handleAbortedGeneration = () => {
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
  };

  const handleError = (error: Error, errorType: "parse") => {
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
  };

  const onGenerate = async (
    promptWithContext: string,
    isRepairFlow: boolean = false,
  ) => {
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
            updateAssistantContent(chunk);
            accumulatedContentRef.current += chunk;
            const content = accumulatedContentRef.current;

            throttledRenderMermaid(content);
          },
          signal: abortController.signal,
        });

      throttledRenderMermaid.flush();

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
  };

  const handleAbort = () => {
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }
  };

  return {
    onGenerate,
    handleAbort,
    isGenerating,
    accumulatedContentRef,
  };
};
