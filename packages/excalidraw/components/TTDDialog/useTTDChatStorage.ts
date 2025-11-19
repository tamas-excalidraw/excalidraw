import { useEffect, useState, useCallback } from "react";
import type { ChatMessageType, ChatHistory } from "../Chat";

const TTD_CHATS_STORAGE_KEY = "excalidraw-ttd-chats";

export interface SavedChat {
  id: string;
  title: string;
  sessionId: string;
  messages: ChatMessageType[];
  currentPrompt: string;
  generatedResponse: string | null;
  timestamp: number;
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
  return trimmed.substring(0, 47) + "...";
};

export interface UseTTDChatStorageParams {
  chatHistory: ChatHistory;
  ttdSessionId: string;
  ttdGeneration: {
    generatedResponse: string | null;
    prompt: string | null;
  } | null;
}

export interface UseTTDChatStorageReturn {
  savedChats: SavedChats;
  saveCurrentChat: () => void;
  deleteChat: (chatId: string) => SavedChats;
  restoreChat: (chat: SavedChat) => SavedChat;
  createNewChatId: () => string;
}

export const useTTDChatStorage = ({
  chatHistory,
  ttdSessionId,
  ttdGeneration,
}: UseTTDChatStorageParams): UseTTDChatStorageReturn => {
  const [savedChats, setSavedChats] = useState<SavedChats>([]);

  useEffect(() => {
    const chats = loadChatsFromStorage();
    setSavedChats(chats);
  }, []);

  const saveCurrentChat = useCallback(() => {
    if (chatHistory.messages.length === 0) {
      return;
    }

    const firstUserMessage = chatHistory.messages.find(
      (msg) => msg.type === "user",
    );
    if (!firstUserMessage) {
      return;
    }

    const currentSavedChats = loadChatsFromStorage();
    const title = generateChatTitle(firstUserMessage.content);
    const chatToSave: SavedChat = {
      id: ttdSessionId,
      title,
      sessionId: ttdSessionId,
      messages: chatHistory.messages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp
            : new Date(msg.timestamp),
      })),
      currentPrompt: chatHistory.currentPrompt,
      generatedResponse: ttdGeneration?.generatedResponse || null,
      timestamp: Date.now(),
    };

    const updatedChats = [
      ...currentSavedChats.filter((chat) => chat.id !== ttdSessionId),
      chatToSave,
    ].sort((a, b) => b.timestamp - a.timestamp);

    setSavedChats(updatedChats);
    saveChatsToStorage(updatedChats);
  }, [chatHistory, ttdSessionId, ttdGeneration]);

  useEffect(() => {
    if (chatHistory.messages.length === 0) {
      return;
    }

    saveCurrentChat();
  }, [
    chatHistory.messages,
    chatHistory.currentPrompt,
    ttdSessionId,
    ttdGeneration,
    saveCurrentChat,
  ]);

  const deleteChat = useCallback(
    (chatId: string): SavedChats => {
      const updatedChats = savedChats.filter((chat) => chat.id !== chatId);
      setSavedChats(updatedChats);
      saveChatsToStorage(updatedChats);
      return updatedChats;
    },
    [savedChats],
  );

  const restoreChat = useCallback(
    (chat: SavedChat): SavedChat => {
      saveCurrentChat();
      return chat;
    },
    [saveCurrentChat],
  );

  const createNewChatId = useCallback((): string => {
    saveCurrentChat();
    return Math.random().toString(36).substring(2, 15);
  }, [saveCurrentChat]);

  return {
    savedChats,
    saveCurrentChat,
    deleteChat,
    restoreChat,
    createNewChatId,
  };
};
