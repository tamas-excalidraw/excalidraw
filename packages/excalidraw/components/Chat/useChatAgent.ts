import { atom, useAtom } from "jotai";
import type { ChatMessage as ChatMessageType, ChatHistory } from "./types";

type AddMessageFn = (
  message: Omit<ChatMessageType, "id" | "timestamp">,
) => void;

const chatHistoryAtom = atom<ChatHistory>({
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
    updateLastMessage: (updates: Partial<ChatMessageType>) => void,
    setError: (error: Error) => void,
    errorMessage: string,
  ) => {
    updateLastMessage({
      isGenerating: false,
      error: errorMessage,
    });
    setError(new Error(errorMessage));
  };

  const updateAssistantContent = (
    updateLastMessage: (updates: Partial<ChatMessageType>) => void,
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
        updateLastMessage({
          content: updatedContent,
        });
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
