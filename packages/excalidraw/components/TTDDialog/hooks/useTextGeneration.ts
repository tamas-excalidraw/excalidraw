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

  const streamingAbortControllerRef = useRef<AbortController | null>(null);

  const validatePrompt = (prompt: string): boolean => {
    if (
      prompt.length > MAX_PROMPT_LENGTH ||
      prompt.length < MIN_PROMPT_LENGTH ||
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

  const handleError = (error: Error, errorType: "parse" | "network") => {
    if (errorType === "parse") {
      trackEvent("ai", "mermaid parse failed", "ttd");
    }

    setAssistantError(error.message, errorType);
    setError(error);
  };

  const onGenerate = async (
    promptWithContext: string,
    isRepairFlow = false,
  ) => {
    if (!validatePrompt(promptWithContext)) {
      return;
    }

    if (!isRepairFlow) {
      addUserAndPendingAssistant(promptWithContext);
    } else {
      setChatHistory((prev) =>
        updateAssistantContent(prev, {
          content: "",
          error: "",
          isGenerating: true,
        }),
      );
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

        // do nothing if request was aborted
        if (isAborted) {
          return;
        }

        if (
          error.message ===
          "Too many requests today, please try again tomorrow!"
        ) {
          // removing assistant message because we display a system upsell msg here
          setChatHistory((prev) => ({
            ...prev,
            messages: prev.messages.slice(0, -1),
          }));
        } else {
          handleError(error as Error, "network");
        }
        return;
      }

      await parseMermaidToExcalidraw(generatedResponse ?? "");

      trackEvent("ai", "mermaid parse success", "ttd");
    } catch (error: unknown) {
      handleError(error as Error, "parse");
    } finally {
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
  };
};
