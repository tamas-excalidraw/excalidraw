import { useEffect, useCallback } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { t } from "../../i18n";
import { useApp, useExcalidrawSetAppState } from "../App";

import {
  convertMermaidToExcalidraw,
  insertToEditor,
  saveMermaidDataToStorage,
} from "./common";
import { TTDProvider, useTTDContext } from "./TTDContext";
import { useMermaidRenderer } from "./hooks/useMermaidRenderer";
import { useChatMessages } from "./hooks/useChatMessages";
import { useTextGeneration } from "./hooks/useTextGeneration";
import { useChatManagement } from "./hooks/useChatManagement";
import { TTDChatPanel } from "./components/TTDChatPanel";
import { TTDPreviewPanel } from "./components/TTDPreviewPanel";
import mockChunks from "./mock";

import type { MermaidToExcalidrawLibProps } from "./common";
import type { ChatMessageType } from "../Chat";
import type { BinaryFiles } from "../../types";
import type { TTDPayload, OnTestSubmitRetValue } from "./types";

export type { OnTestSubmitRetValue, TTDPayload };

const TextToDiagramContent = () => {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();

  const {
    mermaidToExcalidrawLib,
    showPreview,
    setShowPreview,
    error,
    setError,
    ttdSessionId,
    ttdGeneration,
    rateLimits,
    canvasRef,
    data,
    chatHistory,
    savedChats,
    updateAssistantContent,
  } = useTTDContext();

  // Mermaid renderer hook
  const {
    renderMermaid,
    throttledRenderMermaid,
    fastThrottledRenderMermaid,
    shouldThrottleRef,
    isRenderingRef,
    resetThrottleState,
  } = useMermaidRenderer();

  // Chat messages hook
  const {
    addMessage,
    updateLastMessage,
    handleDeleteMessage,
    removeLastErrorMessage,
    handlePromptChange,
    getMessagesForApi,
  } = useChatMessages({ renderMermaid });

  // Text generation hook
  const { onGenerate, handleAbort, isGenerating, accumulatedContentRef } =
    useTextGeneration({
      getMessagesForApi,
      addMessage,
      updateLastMessage,
      removeLastErrorMessage,
      renderMermaid,
      throttledRenderMermaid,
      fastThrottledRenderMermaid,
      shouldThrottleRef,
      resetThrottleState,
    });

  // Chat management hook
  const {
    isMenuOpen,
    onRestoreChat,
    handleDeleteChat,
    handleNewChat,
    handleMenuToggle,
    handleMenuClose,
  } = useChatManagement({
    accumulatedContentRef,
    renderMermaid,
    handleAbort,
  });

  // Initialize showPreview from ttdGeneration
  useEffect(() => {
    if (
      ttdGeneration?.validMermaidContent ||
      ttdGeneration?.generatedResponse
    ) {
      setShowPreview(true);
    }
  }, [
    ttdGeneration?.validMermaidContent,
    ttdGeneration?.generatedResponse,
    setShowPreview,
  ]);

  // Render mermaid when library loads
  useEffect(() => {
    if (
      mermaidToExcalidrawLib.loaded &&
      !isGenerating &&
      !isRenderingRef.current
    ) {
      const contentToRender =
        ttdGeneration?.validMermaidContent || ttdGeneration?.generatedResponse;
      if (contentToRender) {
        renderMermaid(contentToRender);
      }
    }
  }, [
    mermaidToExcalidrawLib.loaded,
    renderMermaid,
    isGenerating,
    ttdGeneration?.validMermaidContent,
    ttdGeneration?.generatedResponse,
    isRenderingRef,
  ]);

  // Add rate limit message when chat opens if limit is zero
  useEffect(() => {
    if (rateLimits?.rateLimitRemaining === 0) {
      const hasRateLimitMessage = chatHistory.messages.some(
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
  }, [rateLimits?.rateLimitRemaining, chatHistory.messages, addMessage]);

  // Replay handler for testing
  const onReplay = useCallback(async () => {
    if (isGenerating || mockChunks.length === 0) {
      return;
    }

    accumulatedContentRef.current = "";
    resetThrottleState();
    setShowPreview(true);

    updateLastMessage({ content: "", isGenerating: true }, "assistant");

    for (const chunk of mockChunks) {
      updateAssistantContent(updateLastMessage, chunk);
      accumulatedContentRef.current += chunk;
      const content = accumulatedContentRef.current;

      if (shouldThrottleRef.current) {
        throttledRenderMermaid(content);
      } else {
        fastThrottledRenderMermaid(content);
      }

      const delay = Math.floor(Math.random() * 5) + 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throttledRenderMermaid.flush();
    fastThrottledRenderMermaid.flush();
    updateLastMessage({ isGenerating: false }, "assistant");
  }, [
    isGenerating,
    accumulatedContentRef,
    resetThrottleState,
    setShowPreview,
    updateLastMessage,
    updateAssistantContent,
    shouldThrottleRef,
    throttledRenderMermaid,
    fastThrottledRenderMermaid,
  ]);

  // View as Mermaid handler
  const onViewAsMermaid = useCallback(() => {
    if (typeof ttdGeneration?.generatedResponse === "string") {
      saveMermaidDataToStorage(ttdGeneration.generatedResponse);
      setAppState({
        openDialog: { name: "ttd", tab: "mermaid" },
      });
    }
  }, [ttdGeneration?.generatedResponse, setAppState]);

  // Message handlers
  const handleMermaidTabClick = useCallback(
    (message: ChatMessageType) => {
      const mermaidContent = message.content || "";
      if (mermaidContent) {
        saveMermaidDataToStorage(mermaidContent);
        setAppState({
          openDialog: { name: "ttd", tab: "mermaid" },
        });
      }
    },
    [setAppState],
  );

  const handleInsertMessage = useCallback(
    async (message: ChatMessageType) => {
      const mermaidContent = message.content || "";
      if (!mermaidContent.trim() || !mermaidToExcalidrawLib.loaded) {
        return;
      }

      const tempDataRef = {
        current: {
          elements: [] as readonly NonDeletedExcalidrawElement[],
          files: null as BinaryFiles | null,
        },
      };

      const result = await convertMermaidToExcalidraw({
        canvasRef,
        data: tempDataRef,
        mermaidToExcalidrawLib,
        setError,
        mermaidDefinition: mermaidContent,
      });

      if (result.success) {
        insertToEditor({
          app,
          data: tempDataRef,
          text: mermaidContent,
          shouldSaveMermaidDataToStorage: true,
        });
      }
    },
    [app, mermaidToExcalidrawLib, setError, canvasRef],
  );

  const handleAiRepairClick = useCallback(
    async (message: ChatMessageType) => {
      const mermaidContent =
        ttdGeneration?.generatedResponse || message.content || "";
      const errorMessage = message.error || "";

      if (!mermaidContent) {
        return;
      }

      const repairPrompt = `Fix the error in this Mermaid diagram. The diagram is:\n\n\`\`\`mermaid\n${mermaidContent}\n\`\`\`\n\nThe exception/error is: ${errorMessage}\n\nPlease fix the Mermaid syntax and regenerate a valid diagram.`;

      await onGenerate(repairPrompt, true);
    },
    [onGenerate, ttdGeneration?.generatedResponse],
  );

  const handleInsertToEditor = useCallback(() => {
    insertToEditor({ app, data });
  }, [app, data]);

  return (
    <div
      className={`ttd-dialog-layout ${
        showPreview
          ? "ttd-dialog-layout--split"
          : "ttd-dialog-layout--chat-only"
      }`}
    >
      <TTDChatPanel
        messages={chatHistory.messages}
        currentPrompt={chatHistory.currentPrompt}
        onPromptChange={handlePromptChange}
        onSendMessage={onGenerate}
        isGenerating={isGenerating}
        generatedResponse={ttdGeneration?.generatedResponse}
        isMenuOpen={isMenuOpen}
        onMenuToggle={handleMenuToggle}
        onMenuClose={handleMenuClose}
        onNewChat={handleNewChat}
        onRestoreChat={onRestoreChat}
        onDeleteChat={handleDeleteChat}
        savedChats={savedChats}
        activeSessionId={ttdSessionId}
        rateLimits={rateLimits}
        onAbort={handleAbort}
        onMermaidTabClick={handleMermaidTabClick}
        onAiRepairClick={handleAiRepairClick}
        onDeleteMessage={handleDeleteMessage}
        onInsertMessage={handleInsertMessage}
        hasValidMermaidContent={!!ttdGeneration?.validMermaidContent}
        onViewAsMermaid={onViewAsMermaid}
      />
      <TTDPreviewPanel
        canvasRef={canvasRef}
        error={error}
        loaded={mermaidToExcalidrawLib.loaded}
        showPreview={showPreview}
        onInsert={handleInsertToEditor}
        onReplay={onReplay}
        isReplayDisabled={isGenerating || mockChunks.length === 0}
      />
    </div>
  );
};

export const TextToDiagram = ({
  mermaidToExcalidrawLib,
  onTextSubmit,
}: {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit(payload: TTDPayload): Promise<OnTestSubmitRetValue>;
}) => {
  return (
    <TTDProvider
      mermaidToExcalidrawLib={mermaidToExcalidrawLib}
      onTextSubmit={onTextSubmit}
    >
      <TextToDiagramContent />
    </TTDProvider>
  );
};

export default TextToDiagram;
