import { findLastIndex, randomId } from "@excalidraw/common";

import { useAtom } from "../../../editor-jotai";

import { chatHistoryAtom } from "../../Chat/useChatAgent";

import type { ChatMessageType } from "../../Chat";
import { useTTDChatStorage } from "../useTTDChatStorage";

interface UseChatMessagesProps {
  renderMermaid: (mermaidDefinition: string) => Promise<boolean>;
}

export const useChatMessages = ({ renderMermaid }: UseChatMessagesProps) => {
  const { saveCurrentChat } = useTTDChatStorage();
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);

  const addMessage = (message: Omit<ChatMessageType, "id" | "timestamp">) => {
    const newMessage: ChatMessageType = {
      ...message,
      id: randomId(),
      timestamp: new Date(),
    };

    setChatHistory((prev) => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));
  };

  const updateLastMessage = (
    updates: Partial<ChatMessageType>,
    type?: ChatMessageType["type"],
  ) => {
    setChatHistory((prev) => {
      const lastMessageByTypeIdx = type
        ? findLastIndex(prev.messages, (msg) => msg.type === type)
        : prev.messages.length - 1;

      return {
        ...prev,
        messages: prev.messages.map((msg, index) =>
          index === lastMessageByTypeIdx ? { ...msg, ...updates } : msg,
        ),
      };
    });
  };

  const handleDeleteMessage = (messageId: string) => {
    const assistantMessageIndex = chatHistory.messages.findIndex(
      (msg) => msg.id === messageId && msg.type === "assistant",
    );

    const remainingMessages = chatHistory.messages.slice(
      0,
      assistantMessageIndex - 1,
    );

    const latestAssistantMessage = remainingMessages.reduce(
      (soFar, curr) => (curr.type === "assistant" ? curr : soFar),
      null as ChatMessageType | null,
    );

    if (latestAssistantMessage) {
      renderMermaid(latestAssistantMessage.content);
    }

    setChatHistory({
      ...chatHistory,
      messages: remainingMessages,
    });
  };

  const removeLastErrorMessage = () => {
    setChatHistory((prev) => {
      const lastErrorIndex = (prev.messages ?? []).findIndex(
        (msg) => msg.type === "assistant" && msg.error,
      );
      if (lastErrorIndex !== -1) {
        return {
          ...prev,
          messages: prev.messages.filter((_, i) => i !== lastErrorIndex),
        };
      }
      return prev;
    });
  };

  const handlePromptChange = (newPrompt: string) => {
    setChatHistory((prev) => ({
      ...prev,
      currentPrompt: newPrompt,
    }));
  };

  const getMessagesForApi = (): Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }> => {
    const filteredMessages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }> = [];

    const lastUserMessage = chatHistory.messages
      .slice()
      .reverse()
      .find((msg) => msg.type === "user");

    const lastAssistantMessages = chatHistory.messages
      .filter((msg) => msg.type === "assistant")
      .slice(-2);

    if (lastUserMessage) {
      filteredMessages.push({
        role: lastUserMessage.type,
        content: lastUserMessage.content,
      });
    }

    filteredMessages.push(
      ...lastAssistantMessages.map((msg) => ({
        role: msg.type as "user" | "assistant" | "system",
        content: msg.content,
      })),
    );

    return filteredMessages;
  };

  return {
    addMessage,
    updateLastMessage,
    handleDeleteMessage,
    removeLastErrorMessage,
    handlePromptChange,
    getMessagesForApi,
  };
};
