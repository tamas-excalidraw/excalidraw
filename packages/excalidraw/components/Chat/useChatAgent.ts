import { findLastIndex } from "@excalidraw/common";
import { atom, useAtom } from "../../editor-jotai";
import { useCallback } from "react";
import type { ChatMessage as ChatMessageType, ChatHistory } from "./types";

type AddMessageFn = (
  message: Omit<ChatMessageType, "id" | "timestamp">,
) => void;

export const chatHistoryAtom = atom<ChatHistory>({
  messages: [],
  currentPrompt: "",
});

export const useChatAgent = () => {
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);

  const addUserAndPendingAssistant = (
    content: string,
    addMessage: AddMessageFn,
  ) => {
    addMessage({
      type: "user",
      content,
    });

    addMessage({
      type: "assistant",
      content: "",
      isGenerating: true,
    });
  };

  const setAssistantError = (
    updateLastMessage: (
      updates: Partial<ChatMessageType>,
      type?: ChatMessageType["type"],
    ) => void,
    setError: (error: Error) => void,
    errorMessage: string,
    errorType: "parse" | "network" | "other" = "other",
    errorDetails?: Error | unknown,
  ) => {
    const serializedErrorDetails = errorDetails
      ? JSON.stringify({
          name: errorDetails instanceof Error ? errorDetails.name : "Error",
          message:
            errorDetails instanceof Error
              ? errorDetails.message
              : String(errorDetails),
          stack: errorDetails instanceof Error ? errorDetails.stack : undefined,
        })
      : undefined;

    updateLastMessage(
      {
        isGenerating: false,
        error: errorMessage,
        errorType,
        errorDetails: serializedErrorDetails,
        content: errorMessage,
      },
      "assistant",
    );
    setError(new Error(errorMessage));
  };

  const updateAssistantContent = (chunk: string) => {
    setChatHistory((prev) => {
      const lastAssistantIndex = findLastIndex(
        prev.messages,
        (msg) => msg.type === "assistant",
      );

      if (lastAssistantIndex === -1) {
        return prev;
      }

      const lastMessage = prev.messages[lastAssistantIndex];
      const updatedMessages = prev.messages.slice();

      updatedMessages[lastAssistantIndex] = {
        ...lastMessage,
        content: (lastMessage.content || "") + chunk,
      };

      return {
        ...prev,
        messages: updatedMessages,
      };
    });
  };

  return {
    addUserAndPendingAssistant,
    setAssistantError,
    updateAssistantContent,
    chatHistory,
    setChatHistory,
  };
};
