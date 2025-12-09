import { useCallback, useState } from "react";

import { t } from "../../../i18n";

import { useTTDContext } from "../TTDContext";

import type { SavedChat } from "../useTTDChatStorage";

interface UseChatManagementProps {
  accumulatedContentRef: React.MutableRefObject<string>;
  renderMermaid: (content: string) => Promise<boolean>;
  handleAbort: () => void;
}

export const useChatManagement = ({
  accumulatedContentRef,
  renderMermaid,
  handleAbort,
}: UseChatManagementProps) => {
  const {
    createNewChatId,
    setTtdSessionId,
    setChatHistory,
    setTtdGeneration,
    setError,
    setShowPreview,
    canvasRef,
    restoreChat,
    deleteChat,
    mermaidToExcalidrawLib,
    ttdSessionId,
    rateLimits,
    addMessage,
  } = useTTDContext();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const resetChatState = useCallback(() => {
    const newSessionId = createNewChatId();
    setTtdSessionId(newSessionId);
    setChatHistory({
      messages: [],
      currentPrompt: "",
    });
    setTtdGeneration(null);
    setError(null);
    setShowPreview(false);
    accumulatedContentRef.current = "";

    const canvasNode = canvasRef.current;
    if (canvasNode) {
      const parent = canvasNode.parentElement;
      if (parent) {
        parent.style.background = "";
        canvasNode.replaceChildren();
      }
    }
  }, [
    createNewChatId,
    setTtdSessionId,
    setChatHistory,
    setTtdGeneration,
    setError,
    setShowPreview,
    accumulatedContentRef,
    canvasRef,
  ]);

  const applyChatToState = useCallback(
    (chat: SavedChat) => {
      setTtdSessionId(chat.sessionId);
      const restoredMessages = chat.messages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp
            : new Date(msg.timestamp),
      }));

      setChatHistory({
        messages: restoredMessages,
        currentPrompt: "",
      });
      setTtdGeneration({
        generatedResponse: chat.generatedResponse,
        prompt: chat.currentPrompt,
        validMermaidContent: chat.validMermaidContent || null,
      });
      if (chat.validMermaidContent || chat.generatedResponse) {
        setShowPreview(true);
      } else {
        setShowPreview(false);
      }

      if (
        rateLimits?.rateLimitRemaining === 0 &&
        restoredMessages?.length > 0
      ) {
        const hasRateLimitMessage = restoredMessages.some(
          (msg) =>
            msg.type === "system" &&
            msg.content.includes(t("chat.rateLimit.message")),
        );

        if (!hasRateLimitMessage) {
          addMessage({
            type: "system",
            content: t("chat.rateLimit.message"),
          });
        }
      }
    },
    [
      setTtdSessionId,
      setChatHistory,
      setTtdGeneration,
      setShowPreview,
      rateLimits?.rateLimitRemaining,
      addMessage,
    ],
  );

  const onRestoreChat = useCallback(
    (chat: SavedChat) => {
      const restoredChat = restoreChat(chat);
      applyChatToState(restoredChat);

      const contentToRender =
        restoredChat.validMermaidContent || restoredChat.generatedResponse;

      if (contentToRender) {
        mermaidToExcalidrawLib.api.then(() => {
          renderMermaid(contentToRender);
        });
      }

      setIsMenuOpen(false);
    },
    [restoreChat, applyChatToState, mermaidToExcalidrawLib.api, renderMermaid],
  );

  const handleDeleteChat = useCallback(
    (chatId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const isDeletingActiveChat = chatId === ttdSessionId;
      const updatedChats = deleteChat(chatId);
      if (isDeletingActiveChat) {
        if (updatedChats.length > 0) {
          const nextChat = updatedChats[0];
          applyChatToState(nextChat);

          const contentToRender =
            nextChat.validMermaidContent || nextChat.generatedResponse;
          if (contentToRender) {
            if (mermaidToExcalidrawLib.loaded) {
              renderMermaid(contentToRender);
            } else {
              mermaidToExcalidrawLib.api.then(() => {
                renderMermaid(contentToRender);
              });
            }
          }
        } else {
          resetChatState();
        }
      }
    },
    [
      deleteChat,
      ttdSessionId,
      applyChatToState,
      mermaidToExcalidrawLib,
      renderMermaid,
      resetChatState,
    ],
  );

  const handleNewChat = useCallback(() => {
    handleAbort();
    resetChatState();
    setIsMenuOpen(false);
  }, [handleAbort, resetChatState]);

  const handleMenuToggle = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleMenuClose = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

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
