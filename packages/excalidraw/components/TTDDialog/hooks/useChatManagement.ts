import { useState } from "react";

import { useAtom } from "../../../editor-jotai";

import { t } from "../../../i18n";

import {
  errorAtom,
  showPreviewAtom,
  rateLimitsAtom,
  ttdSessionIdAtom,
  chatHistoryAtom,
} from "../TTDContext";
import { useTTDChatStorage } from "../useTTDChatStorage";

import type { SavedChat } from "../useTTDChatStorage";
import { addMessages, getLastAssistantMessage } from "../utils/chat";

interface UseChatManagementProps {
  handleAbort: () => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

export const useChatManagement = ({}: UseChatManagementProps) => {
  const [, setError] = useAtom(errorAtom);
  const [, setShowPreview] = useAtom(showPreviewAtom);
  const [, setTtdSessionId] = useAtom(ttdSessionIdAtom);
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [ttdSessionId] = useAtom(ttdSessionIdAtom);
  const [rateLimits] = useAtom(rateLimitsAtom);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { restoreChat, deleteChat, createNewChatId } = useTTDChatStorage();

  const resetChatState = () => {
    const newSessionId = createNewChatId();
    setTtdSessionId(newSessionId);
    setChatHistory({
      messages: [],
      currentPrompt: "",
    });
    setError(null);
    setShowPreview(false);
  };

  const applyChatToState = (chat: SavedChat) => {
    setTtdSessionId(chat.sessionId);
    const restoredMessages = chat.messages.map((msg) => ({
      ...msg,
      timestamp:
        msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
    }));

    setChatHistory({
      messages: restoredMessages,
      currentPrompt: "",
    });

    const lastAssistantMessage = getLastAssistantMessage(chat);
    setShowPreview(
      !!lastAssistantMessage.validMermaidContent ||
        !!lastAssistantMessage.content,
    );

    if (rateLimits?.rateLimitRemaining === 0 && restoredMessages?.length > 0) {
      const hasRateLimitMessage = restoredMessages.some(
        (msg) =>
          msg.type === "system" &&
          msg.content.includes(t("chat.rateLimit.message")),
      );

      if (!hasRateLimitMessage) {
        setChatHistory(
          addMessages(chatHistory, [
            {
              type: "system",
              content: t("chat.rateLimit.message"),
            },
          ]),
        );
      }
    }
  };

  const onRestoreChat = (chat: SavedChat) => {
    const restoredChat = restoreChat(chat);
    applyChatToState(restoredChat);

    setIsMenuOpen(false);
  };

  const handleDeleteChat = (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const isDeletingActiveChat = chatId === ttdSessionId;
    const updatedChats = deleteChat(chatId);

    if (isDeletingActiveChat) {
      if (updatedChats.length > 0) {
        const nextChat = updatedChats[0];
        applyChatToState(nextChat);
      } else {
        resetChatState();
      }
    }
  };

  const handleNewChat = () => {
    resetChatState();
    setIsMenuOpen(false);
  };

  const handleMenuToggle = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  return {
    isMenuOpen,
    resetChatState,
    applyChatToState,
    onRestoreChat,
    handleDeleteChat,
    handleNewChat,
    handleMenuToggle,
    handleMenuClose,
  };
};
