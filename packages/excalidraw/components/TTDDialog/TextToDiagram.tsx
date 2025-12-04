import { useEffect, useRef, useState, useCallback } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

import { findLastIndex, randomId } from "@excalidraw/common";

import { trackEvent } from "../../analytics";
import { atom, useAtom } from "../../editor-jotai";
import { t } from "../../i18n";
import { useApp, useExcalidrawSetAppState } from "../App";
import {
  ArrowRightIcon,
  HelpIconThin,
  HamburgerMenuIcon,
  TrashIcon,
} from "../icons";
import { Tooltip } from "../Tooltip";
import DropdownMenu from "../dropdownMenu/DropdownMenu";
import { ChatInterface, useChatAgent } from "../Chat";
import { InlineIcon } from "../InlineIcon";
import { useTTDChatStorage } from "./useTTDChatStorage";
import { TTDDialogOutput } from "./TTDDialogOutput";
import { TTDDialogPanel } from "./TTDDialogPanel";
import {
  convertMermaidToExcalidraw,
  insertToEditor,
  saveMermaidDataToStorage,
} from "./common";

import type { MermaidToExcalidrawLibProps } from "./common";
import type { ChatMessageType } from "../Chat";
import type { SavedChat } from "./useTTDChatStorage";
import type { BinaryFiles } from "../../types";
import { isFiniteNumber } from "@excalidraw/math";
import mockChunks from "./mock";
import clsx from "clsx";

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 1000;

const rateLimitsAtom = atom<{
  rateLimit: number;
  rateLimitRemaining: number;
} | null>(null);

const ttdGenerationAtom = atom<{
  generatedResponse: string | null;
  prompt: string | null;
  validMermaidContent: string | null;
} | null>(null);

const ttdSessionIdAtom = atom<string>(randomId());

export type OnTestSubmitRetValue = {
  rateLimit?: number | null;
  rateLimitRemaining?: number | null;
} & (
  | { generatedResponse: string | undefined; error?: null | undefined }
  | {
      error: Error;
      generatedResponse?: null | undefined;
    }
);

export type TTDPayload = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
};

export const TextToDiagram = ({
  mermaidToExcalidrawLib,
  onTextSubmit,
}: {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit(payload: TTDPayload): Promise<OnTestSubmitRetValue>;
}) => {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const someRandomDivRef = useRef<HTMLDivElement>(null);
  const [ttdSessionId, setTtdSessionId] = useAtom(ttdSessionIdAtom);
  const [ttdGeneration, setTtdGeneration] = useAtom(ttdGenerationAtom);
  const [onTextSubmitInProgess, setOnTextSubmitInProgess] = useState(false);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);
  const [showPreview, setShowPreview] = useState(
    !!(ttdGeneration?.validMermaidContent || ttdGeneration?.generatedResponse),
  );
  const accumulatedContentRef = useRef("");
  const streamingAbortControllerRef = useRef<AbortController | null>(null);
  const isRenderingRef = useRef<boolean>(false);
  const pendingRenderContentRef = useRef<string | null>(null);

  const data = useRef<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>({ elements: [], files: null });

  const [error, setError] = useState<Error | null>(null);

  const {
    addUserAndPendingAssistant,
    setAssistantError,
    updateAssistantContent,
    chatHistory,
    setChatHistory,
  } = useChatAgent();

  const {
    savedChats,
    saveCurrentChat,
    deleteChat,
    restoreChat,
    createNewChatId,
  } = useTTDChatStorage({
    chatHistory,
    ttdSessionId,
    ttdGeneration,
  });

  const handlePromptChange = (newPrompt: string) => {
    setChatHistory((prev) => ({
      ...prev,
      currentPrompt: newPrompt,
    }));
  };

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

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
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
    },
    [setChatHistory, setTtdGeneration, ttdGeneration],
  );

  const renderMermaid = useCallback(
    async (mermaidDefinition: string) => {
      if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
        return;
      }

      if (isRenderingRef.current) {
        pendingRenderContentRef.current = mermaidDefinition;
        return;
      }

      isRenderingRef.current = true;

      pendingRenderContentRef.current = null;

      // quick hack for letting the GC cleanup between renders
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => resolve(), { timeout: 5 });
        } else {
          setTimeout(() => resolve(), 0);
        }
      });

      const result = await convertMermaidToExcalidraw({
        canvasRef: someRandomDivRef,
        data,
        mermaidToExcalidrawLib,
        setError,
        mermaidDefinition,
      });

      if (result.success) {
        setTtdGeneration((s) => ({
          generatedResponse: s?.generatedResponse ?? null,
          prompt: s?.prompt ?? null,
          validMermaidContent: mermaidDefinition,
        }));
      }

      isRenderingRef.current = false;
    },
    [mermaidToExcalidrawLib, setTtdGeneration, someRandomDivRef],
  );

  const onReplay = useCallback(async () => {
    if (onTextSubmitInProgess || mockChunks.length === 0) {
      return;
    }

    accumulatedContentRef.current = "";
    setOnTextSubmitInProgess(true);
    setShowPreview(true);

    updateLastMessage({ content: "", isGenerating: true }, "assistant");

    for (const chunk of mockChunks) {
      updateAssistantContent(updateLastMessage, chunk);
      accumulatedContentRef.current += chunk;
      renderMermaid(accumulatedContentRef.current);

      const delay = Math.floor(Math.random() * 5) + 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    updateLastMessage({ isGenerating: false }, "assistant");
    setOnTextSubmitInProgess(false);
  }, [
    onTextSubmitInProgess,
    chatHistory.messages,
    setChatHistory,
    updateLastMessage,
    updateAssistantContent,
    renderMermaid,
    setOnTextSubmitInProgess,
  ]);

  useEffect(() => {
    if (
      mermaidToExcalidrawLib.loaded &&
      !onTextSubmitInProgess &&
      !isRenderingRef.current
    ) {
      const contentToRender =
        ttdGeneration?.validMermaidContent || ttdGeneration?.generatedResponse;
      if (contentToRender) {
        renderMermaid(contentToRender);
      }
    }
  }, [mermaidToExcalidrawLib.loaded, renderMermaid, onTextSubmitInProgess]);

  // Add rate limit message when chat opens if limit is zero and message doesn't exist
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
  }, [rateLimits?.rateLimitRemaining, chatHistory.messages, addMessage, t]);

  const onGenerate = async (
    promptWithContext: string,
    isRepairFlow: boolean = false,
  ) => {
    if (
      promptWithContext.length > MAX_PROMPT_LENGTH ||
      promptWithContext.length < MIN_PROMPT_LENGTH ||
      onTextSubmitInProgess ||
      rateLimits?.rateLimitRemaining === 0
    ) {
      if (promptWithContext.length < MIN_PROMPT_LENGTH) {
        setError(
          new Error(
            t("chat.errors.promptTooShort", { min: MIN_PROMPT_LENGTH }),
          ),
        );
      }
      if (promptWithContext.length > MAX_PROMPT_LENGTH) {
        setError(
          new Error(t("chat.errors.promptTooLong", { max: MAX_PROMPT_LENGTH })),
        );
      }

      return;
    }

    setTtdGeneration((s) => ({
      generatedResponse: s?.generatedResponse ?? null,
      prompt: s?.prompt ?? null,
      validMermaidContent: null,
    }));

    if (isRepairFlow) {
      addMessage({
        type: "assistant",
        content: "",
        isGenerating: true,
      });
    } else {
      addUserAndPendingAssistant(promptWithContext, addMessage);
    }

    accumulatedContentRef.current = "";

    setShowPreview(true);

    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    streamingAbortControllerRef.current = abortController;

    try {
      setOnTextSubmitInProgess(true);

      trackEvent("ai", "generate", "ttd");

      const { generatedResponse, error, rateLimit, rateLimitRemaining } =
        await onTextSubmit({
          messages: [
            ...chatHistory.messages.map((msg) => ({
              role: msg.type,
              content: msg.content,
            })),
            { role: "user", content: promptWithContext },
          ],
          onChunk: (chunk: string) => {
            updateAssistantContent(updateLastMessage, chunk);
            accumulatedContentRef.current += chunk;
            renderMermaid(accumulatedContentRef.current);
          },
          signal: abortController.signal,
        });

      if (typeof generatedResponse === "string") {
        setTtdGeneration((s) => ({
          generatedResponse,
          prompt: s?.prompt ?? null,
          validMermaidContent: s?.validMermaidContent ?? null,
        }));

        accumulatedContentRef.current = generatedResponse;
      }

      if (isFiniteNumber(rateLimit) && isFiniteNumber(rateLimitRemaining)) {
        const previousRemaining = rateLimits?.rateLimitRemaining ?? null;
        setRateLimits({ rateLimit, rateLimitRemaining });

        if (
          rateLimitRemaining === 0 &&
          previousRemaining !== null &&
          previousRemaining > 0
        ) {
          updateLastMessage(
            {
              isGenerating: false,
            },
            "assistant",
          );
          addMessage({
            type: "system",
            content: t("chat.rateLimit.message"),
          });
        }
      }

      if (error) {
        if (
          error.message ===
          "Too many requests today, please try again tomorrow!"
        ) {
          // REMOVING LAST MSG
          setChatHistory((prev) => ({
            ...prev,
            messages: prev.messages.slice(0, -1),
          }));
        } else {
          setAssistantError(
            updateLastMessage,
            setError,
            error.message,
            "network",
          );
        }
        return;
      }

      updateLastMessage(
        {
          isGenerating: false,
          content: generatedResponse ?? "",
        },
        "assistant",
      );

      if (isRepairFlow) {
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
      }

      saveCurrentChat();

      await parseMermaidToExcalidraw(generatedResponse ?? "");

      // do a final render, just to be sure
      renderMermaid(accumulatedContentRef.current);
      trackEvent("ai", "mermaid parse success", "ttd");
    } catch (error: unknown) {
      console.log("### err", error, (error as Error).message);
      handleError(error as Error, "parse");
    } finally {
      setOnTextSubmitInProgess(false);
      streamingAbortControllerRef.current = null;
    }
  };

  const handleError = useCallback(
    (error: Error, errorType: "parse") => {
      let message: string | undefined = error.message;

      if (errorType === "parse") {
        trackEvent("ai", "mermaid parse failed", "ttd");
        message = t("chat.errors.invalidDiagram");
        updateLastMessage(
          {
            isGenerating: false,
            error: error.message,
            errorType: "parse",
            content: message,
          },
          "assistant",
        );
        setError(new Error(message));
      }
    },
    [
      updateLastMessage,
      setAssistantError,
      setError,
      ttdGeneration?.validMermaidContent,
    ],
  );

  const onViewAsMermaid = () => {
    if (typeof ttdGeneration?.generatedResponse === "string") {
      saveMermaidDataToStorage(ttdGeneration.generatedResponse);
      setAppState({
        openDialog: { name: "ttd", tab: "mermaid" },
      });
    }
  };

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
    [onGenerate, ttdGeneration?.generatedResponse, setChatHistory],
  );

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
      rateLimits?.rateLimitRemaining,
      addMessage,
      t,
    ],
  );

  const onRestoreChat = (chat: SavedChat) => {
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
  };

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
      createNewChatId,
      setTtdSessionId,
      setChatHistory,
      setTtdGeneration,
      mermaidToExcalidrawLib,
      renderMermaid,
    ],
  );

  const handleAbort = () => {
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }
  };

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

    const canvasNode = someRandomDivRef.current;
    if (canvasNode) {
      const parent = canvasNode.parentElement;
      if (parent) {
        parent.style.background = "";
        canvasNode.replaceChildren();
      }
    }
  }, [createNewChatId, setTtdSessionId, setChatHistory, setTtdGeneration]);

  const handleNewChat = () => {
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }
    resetChatState();
    setIsMenuOpen(false);
  };

  return (
    <div
      className={`ttd-dialog-layout ${
        showPreview
          ? "ttd-dialog-layout--split"
          : "ttd-dialog-layout--chat-only"
      }`}
    >
      <TTDDialogPanel
        label={
          <div className="ttd-dialog-panel__label-wrapper">
            <div className="ttd-dialog-panel__label-group">
              <label>{t("chat.label")}</label>
              <Tooltip label={t("chat.helpTooltip")} long>
                <button
                  type="button"
                  aria-label={t("chat.helpAriaLabel")}
                  className="ttd-dialog-info"
                >
                  {HelpIconThin}
                </button>
              </Tooltip>
            </div>
            <div className="ttd-dialog-panel__header-right">
              {rateLimits && (
                <div className="ttd-dialog-panel__rate-limit">
                  {t("chat.rateLimitRemaining", {
                    count: rateLimits.rateLimitRemaining,
                  })}
                </div>
              )}
              <div className="ttd-dialog-panel__menu-wrapper">
                <DropdownMenu open={isMenuOpen}>
                  <DropdownMenu.Trigger
                    onToggle={() => setIsMenuOpen(!isMenuOpen)}
                    className="ttd-dialog-menu-trigger"
                    disabled={onTextSubmitInProgess}
                    title={t("chat.menu")}
                    aria-label={t("chat.menu")}
                  >
                    {HamburgerMenuIcon}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content
                    onClickOutside={() => setIsMenuOpen(false)}
                    onSelect={() => setIsMenuOpen(false)}
                    placement="bottom"
                  >
                    <DropdownMenu.Item onSelect={handleNewChat}>
                      {t("chat.newChat")}
                    </DropdownMenu.Item>
                    {savedChats.length > 0 && (
                      <>
                        <DropdownMenu.Separator />
                        {savedChats.map((chat) => (
                          <DropdownMenu.ItemCustom
                            key={chat.id}
                            className={clsx("ttd-chat-menu-item", {
                              "ttd-chat-menu-item--active":
                                chat.id === ttdSessionId,
                            })}
                            onClick={() => {
                              onRestoreChat(chat);
                            }}
                          >
                            <span className="ttd-chat-menu-item__title">
                              {chat.title}
                            </span>
                            <button
                              className="ttd-chat-menu-item__delete"
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              title={t("chat.deleteChat")}
                              aria-label={t("chat.deleteChat")}
                              type="button"
                            >
                              {TrashIcon}
                            </button>
                          </DropdownMenu.ItemCustom>
                        ))}
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu>
              </div>
            </div>
          </div>
        }
        className="ttd-dialog-chat-panel"
        panelActionOrientation="right"
        panelAction={
          !!ttdGeneration?.validMermaidContent
            ? {
                action: onViewAsMermaid,
                label: t("chat.viewAsMermaid"),
                icon: <InlineIcon icon={ArrowRightIcon} />,
                variant: "link",
              }
            : undefined
        }
      >
        <ChatInterface
          messages={chatHistory.messages}
          currentPrompt={chatHistory.currentPrompt}
          onPromptChange={handlePromptChange}
          onSendMessage={onGenerate}
          isGenerating={onTextSubmitInProgess}
          generatedResponse={ttdGeneration?.generatedResponse}
          onAbort={handleAbort}
          onMermaidTabClick={onViewAsMermaid}
          onAiRepairClick={handleAiRepairClick}
          onDeleteMessage={handleDeleteMessage}
          placeholder={{
            title: t("chat.placeholder.title"),
            description: t("chat.placeholder.description"),
          }}
        />
      </TTDDialogPanel>
      <TTDDialogPanel
        label={t("chat.preview")}
        panelActionOrientation="right"
        panelAction={
          showPreview
            ? {
                action: () => {
                  insertToEditor({ app, data });
                },
                label: t("chat.insert"),
                icon: ArrowRightIcon,
              }
            : undefined
        }
        renderTopRight={() => (
          <button
            onClick={onReplay}
            disabled={onTextSubmitInProgess || mockChunks.length === 0}
            className="ttd-replay-button"
            type="button"
            title="Replay"
          >
            Replay
          </button>
        )}
        className={`ttd-dialog-preview-panel ${
          showPreview ? "" : "ttd-dialog-preview-panel--hidden"
        }`}
      >
        <TTDDialogOutput
          canvasRef={someRandomDivRef}
          error={error}
          loaded={mermaidToExcalidrawLib.loaded}
        />
      </TTDDialogPanel>
    </div>
  );
};

export default TextToDiagram;
