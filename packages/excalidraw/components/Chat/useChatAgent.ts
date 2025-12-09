import { findLastIndex } from "@excalidraw/common";
import { atom, useAtom } from "jotai";
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

  const updateAssistantContent = (
    updateLastMessage: (
      updates: Partial<ChatMessageType>,
      type?: ChatMessageType["type"],
    ) => void,
    chunk: string,
  ) => {
    setChatHistory((prev) => {
      const lastMessage = prev.messages[prev.messages.length - 1];

      if (lastMessage?.type === "assistant") {
        const updatedContent = (lastMessage.content || "") + chunk;

        const updatedMessages = prev.messages.map((msg, index) =>
          index === prev.messages.length - 1
            ? { ...msg, content: updatedContent }
            : msg,
        );

        updateLastMessage(
          {
            content: updatedContent,
          },
          "assistant",
        );

        return {
          ...prev,
          messages: updatedMessages,
        };
      }
      return prev;
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
