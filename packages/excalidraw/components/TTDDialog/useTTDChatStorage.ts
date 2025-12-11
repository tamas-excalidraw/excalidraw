import { useEffect } from "react";
import { randomId } from "@excalidraw/common";

import { atom, useAtom } from "../../editor-jotai";

import { chatHistoryAtom } from "../Chat/useChatAgent";

import { ttdSessionIdAtom, ttdGenerationAtom } from "./TTDContext";

import type { ChatMessageType } from "../Chat";

const TTD_CHATS_STORAGE_KEY = "excalidraw-ttd-chats";

export interface SavedChat {
  id: string;
  title: string;
  sessionId: string;
  messages: ChatMessageType[];
  currentPrompt: string;
  generatedResponse: string | null;
  validMermaidContent: string | null;
  timestamp: number;
}

export interface UseTTDChatStorageReturn {
  savedChats: SavedChats;
  saveCurrentChat: () => void;
  deleteChat: (chatId: string) => SavedChats;
  restoreChat: (chat: SavedChat) => SavedChat;
  createNewChatId: () => string;
}

type SavedChats = SavedChat[];

const saveChatsToStorage = (chats: SavedChats) => {
  try {
    window.localStorage.setItem(TTD_CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch (error: any) {
    console.warn(`Failed to save chats to localStorage: ${error.message}`);
  }
};

const loadChatsFromStorage = (): SavedChats => {
  try {
    const data = window.localStorage.getItem(TTD_CHATS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data) as SavedChats;
    }
  } catch (error: any) {
    console.warn(`Failed to load chats from localStorage: ${error.message}`);
  }
  return [];
};

const generateChatTitle = (firstMessage: string): string => {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 50) {
    return trimmed;
  }
  return `${trimmed.substring(0, 47)}...`;
};

// Shared atom for saved chats - initialized once from localStorage
export const savedChatsAtom = atom<SavedChats>(loadChatsFromStorage());

export const useTTDChatStorage = (): UseTTDChatStorageReturn => {
  const [chatHistory] = useAtom(chatHistoryAtom);
  const [ttdSessionId] = useAtom(ttdSessionIdAtom);
  const [ttdGeneration] = useAtom(ttdGenerationAtom);
  const [savedChats, setSavedChats] = useAtom(savedChatsAtom);

  const lastMessageInHistory =
    chatHistory?.messages[chatHistory?.messages.length - 1];

  const saveCurrentChat = () => {
    if (chatHistory.messages.length === 0) {
      return;
    }

    const firstUserMessage = chatHistory.messages.find(
      (msg) => msg.type === "user",
    );
    if (!firstUserMessage) {
      return;
    }

    const title = generateChatTitle(firstUserMessage.content);

    const currentSavedChats = loadChatsFromStorage();
    const existingChat = currentSavedChats.find(
      (chat) => chat.id === ttdSessionId,
    );

    const messagesChanged =
      !existingChat ||
      existingChat.messages.length !== chatHistory.messages.length ||
      existingChat.messages.some(
        (msg, i) =>
          msg.id !== chatHistory.messages[i]?.id ||
          msg.content !== chatHistory.messages[i]?.content,
      );

    const chatToSave: SavedChat = {
      id: ttdSessionId,
      title,
      sessionId: ttdSessionId,
      messages: chatHistory.messages
        .filter((msg) => msg.type !== "system")
        .map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp
              : new Date(msg.timestamp),
        })),
      currentPrompt: chatHistory.currentPrompt,
      generatedResponse: ttdGeneration?.generatedResponse || null,
      validMermaidContent: ttdGeneration?.validMermaidContent || null,
      timestamp: messagesChanged
        ? Date.now()
        : existingChat?.timestamp ?? Date.now(),
    };

    const updatedChats = [
      ...currentSavedChats.filter((chat) => chat.id !== ttdSessionId),
      chatToSave,
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    setSavedChats(updatedChats);
    saveChatsToStorage(updatedChats);
  };

  useEffect(() => {
    if (!lastMessageInHistory?.isGenerating) {
      saveCurrentChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageInHistory?.id, lastMessageInHistory?.isGenerating]);

  const deleteChat = (chatId: string): SavedChats => {
    const updatedChats = savedChats.filter((chat) => chat.id !== chatId);
    setSavedChats(updatedChats);
    saveChatsToStorage(updatedChats);

    return updatedChats;
  };

  const restoreChat = (chat: SavedChat): SavedChat => {
    saveCurrentChat();
    return chat;
  };

  const createNewChatId = (): string => {
    saveCurrentChat();
    return randomId();
  };

  return {
    savedChats,
    saveCurrentChat,
    deleteChat,
    restoreChat,
    createNewChatId,
  };
};
