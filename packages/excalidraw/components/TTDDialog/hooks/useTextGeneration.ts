import { useRef, useState } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { isFiniteNumber } from "@excalidraw/math";

import { useAtom } from "../../../editor-jotai";

import { trackEvent } from "../../../analytics";
import { t } from "../../../i18n";

import { errorAtom, rateLimitsAtom, chatHistoryAtom } from "../TTDContext";
import { useChatAgent } from "../../Chat";

import type { TTDPayload, OnTestSubmitRetValue } from "../types";
import {
  addMessages,
  getLastAssistantMessage,
  getMessagesForApi,
  removeLastErrorMessage,
  updateAssistantContent,
} from "../utils/chat";

interface UseTextGenerationProps {
  onTextSubmit: (payload: TTDPayload) => Promise<OnTestSubmitRetValue>;
}

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 10000;

export const useTextGeneration = ({ onTextSubmit }: UseTextGenerationProps) => {
  const [, setError] = useAtom(errorAtom);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);

  const { addUserAndPendingAssistant, setAssistantError } = useChatAgent();

  const [isGenerating, setIsGenerating] = useState(false);
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

  const handleAbortedGeneration = async () => {
    setChatHistory(
      updateAssistantContent(chatHistory, {
        isGenerating: false,
      }),
    );
  };

  const handleError = (error: Error, errorType: "parse") => {
    const message: string | undefined = error.message;

    if (errorType === "parse") {
      trackEvent("ai", "mermaid parse failed", "ttd");
      setChatHistory(
        updateAssistantContent(chatHistory, {
          isGenerating: false,
          error: error.message,
          errorType: "parse",
        }),
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

    if (isRepairFlow) {
      setChatHistory(
        addMessages(chatHistory, [
          {
            type: "assistant",
            content: "",
            isGenerating: true,
          },
        ]),
      );
    } else {
      addUserAndPendingAssistant(promptWithContext);
    }

    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    streamingAbortControllerRef.current = abortController;

    try {
      trackEvent("ai", "generate", "ttd");

      const filteredMessages = getMessagesForApi(chatHistory);

      const { generatedResponse, error, rateLimit, rateLimitRemaining } =
        await onTextSubmit({
          messages: [
            ...filteredMessages,
            { role: "user", content: promptWithContext },
          ],
          onChunk: (chunk: string) => {
            setChatHistory((prev) => {
              const lastAssistantMessage = getLastAssistantMessage(prev);
              return updateAssistantContent(prev, {
                content: lastAssistantMessage.content + chunk,
              });
            });
          },
          signal: abortController.signal,
        });

      setChatHistory((prev) =>
        updateAssistantContent(prev, {
          isGenerating: false,
        }),
      );

      if (isFiniteNumber(rateLimit) && isFiniteNumber(rateLimitRemaining)) {
        setRateLimits({ rateLimit, rateLimitRemaining });
      }

      if (error) {
        const isAborted =
          error.name === "AbortError" ||
          error.message === "Aborted" ||
          abortController.signal.aborted;

        if (isAborted) {
          await handleAbortedGeneration();
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
          setError(error);
          setAssistantError(error.message, "network");
        }
        return;
      }

      if (isRepairFlow) {
        setChatHistory(removeLastErrorMessage(chatHistory));
      }

      await parseMermaidToExcalidraw(generatedResponse ?? "");

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
  };
};
