import { useEffect, useRef, useState, useCallback } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { randomId } from "@excalidraw/common";

import { trackEvent } from "../../analytics";
import { atom, useAtom } from "../../editor-jotai";
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
  justValidateMermaid,
  saveMermaidDataToStorage,
} from "./common";

import type { MermaidToExcalidrawLibProps } from "./common";
import type { ChatMessageType } from "../Chat";
import type { SavedChat } from "./useTTDChatStorage";
import type { BinaryFiles } from "../../types";
import { isFiniteNumber } from "@excalidraw/math";

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 1000;

const rateLimitsAtom = atom<{
  rateLimit: number;
  rateLimitRemaining: number;
} | null>(null);

const ttdGenerationAtom = atom<{
  generatedResponse: string | null;
  prompt: string | null;
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

  const updateLastMessage = (updates: Partial<ChatMessageType>) => {
    setChatHistory((prev) => ({
      ...prev,
      messages: prev.messages.map((msg, index) =>
        index === prev.messages.length - 1 ? { ...msg, ...updates } : msg,
      ),
    }));
  };

  const [onTextSubmitInProgess, setOnTextSubmitInProgess] = useState(false);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);
  const [showPreview, setShowPreview] = useState(
    !!ttdGeneration?.generatedResponse,
  );

  const data = useRef<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>({ elements: [], files: null });

  const [error, setError] = useState<Error | null>(null);
  const accumulatedContentRef = useRef("");
  const streamingAbortControllerRef = useRef<AbortController | null>(null);
  const mermaidRenderAbortControllerRef = useRef<AbortController | null>(null);

  const renderMermaid = useCallback(
    async (mermaidDefinition: string) => {
      if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
        return false;
      }

      if (mermaidRenderAbortControllerRef.current) {
        mermaidRenderAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      mermaidRenderAbortControllerRef.current = abortController;

      try {
        await convertMermaidToExcalidraw({
          canvasRef: someRandomDivRef,
          data,
          mermaidToExcalidrawLib,
          setError,
          mermaidDefinition,
          signal: abortController.signal,
        });

        setError(null);
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return false;
        }

        return false;
      }
    },
    [mermaidToExcalidrawLib],
  );

  // Render preview when dialog opens with existing content
  useEffect(() => {
    if (
      mermaidToExcalidrawLib.loaded &&
      ttdGeneration?.generatedResponse &&
      !onTextSubmitInProgess
    ) {
      renderMermaid(ttdGeneration.generatedResponse!);
    }
  }, [
    mermaidToExcalidrawLib.loaded,
    ttdGeneration?.generatedResponse,
    renderMermaid,
    onTextSubmitInProgess,
  ]);

  const onGenerate = async (promptWithContext: string) => {
    if (
      promptWithContext.length > MAX_PROMPT_LENGTH ||
      promptWithContext.length < MIN_PROMPT_LENGTH ||
      onTextSubmitInProgess ||
      rateLimits?.rateLimitRemaining === 0
    ) {
      if (promptWithContext.length < MIN_PROMPT_LENGTH) {
        setError(
          new Error(
            `Prompt is too short (min ${MIN_PROMPT_LENGTH} characters)`,
          ),
        );
      }
      if (promptWithContext.length > MAX_PROMPT_LENGTH) {
        setError(
          new Error(`Prompt is too long (max ${MAX_PROMPT_LENGTH} characters)`),
        );
      }

      return;
    }

    addUserAndPendingAssistant(promptWithContext, addMessage);

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
        }));

        accumulatedContentRef.current = generatedResponse;
      }

      if (isFiniteNumber(rateLimit) && isFiniteNumber(rateLimitRemaining)) {
        setRateLimits({ rateLimit, rateLimitRemaining });
      }

      if (error) {
        setAssistantError(updateLastMessage, setError, error.message);
        return;
      }
      if (!generatedResponse) {
        setAssistantError(updateLastMessage, setError, "Generation failed");
        return;
      }

      updateLastMessage({
        isGenerating: false,
        content: generatedResponse,
      });

      saveCurrentChat();

      const isValid = await justValidateMermaid(generatedResponse);

      if (isValid) {
        trackEvent("ai", "mermaid parse success", "ttd");
      } else {
        handleInvalidMermaidError(generatedResponse);
      }
    } catch (error: unknown) {
      handleGenerationError(error as Error);
    } finally {
      setOnTextSubmitInProgess(false);
      streamingAbortControllerRef.current = null;
    }
  };

  const handleInvalidMermaidError = useCallback(
    (generatedResponse?: string) => {
      trackEvent("ai", "mermaid parse failed", "ttd");
      const errorMessage = generatedResponse
        ? `Generated an invalid diagram :(. You may also try a different prompt.
                Response: ${generatedResponse}`
        : "Generated an invalid diagram :(. You may also try a different prompt.";
      updateLastMessage({
        isGenerating: false,
        error: errorMessage,
      });
      setError(
        new Error(
          "Generated an invalid diagram :(. You may also try a different prompt.",
        ),
      );
    },
    [updateLastMessage],
  );

  const handleGenerationError = useCallback(
    (error: Error) => {
      let message: string | undefined = error.message;

      if (error.name === "AbortError" || message === "Request aborted") {
        message = "Request aborted";
        updateLastMessage({
          isGenerating: false,
        });
      } else {
        if (!message || message === "Failed to fetch") {
          message = "Request failed";
        }
        updateLastMessage({
          isGenerating: false,
          error: message,
        });
        setError(new Error(message));
      }
    },
    [updateLastMessage],
  );

  const onViewAsMermaid = () => {
    if (typeof ttdGeneration?.generatedResponse === "string") {
      saveMermaidDataToStorage(ttdGeneration.generatedResponse);
      setAppState({
        openDialog: { name: "ttd", tab: "mermaid" },
      });
    }
  };

  const applyChatToState = useCallback(
    (chat: SavedChat) => {
      setTtdSessionId(chat.sessionId);
      setChatHistory({
        messages: chat.messages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp
              : new Date(msg.timestamp),
        })),
        currentPrompt: chat.currentPrompt,
      });
      setTtdGeneration({
        generatedResponse: chat.generatedResponse,
        prompt: chat.currentPrompt,
      });
      if (chat.generatedResponse) {
        setShowPreview(true);
      } else {
        setShowPreview(false);
      }
    },
    [setTtdSessionId, setChatHistory, setTtdGeneration],
  );

  const restoreChatRef = useRef<(chat: SavedChat) => void>(() => {});

  useEffect(() => {
    restoreChatRef.current = (chat: SavedChat) => {
      const restoredChat = restoreChat(chat);
      applyChatToState(restoredChat);

      if (restoredChat.generatedResponse) {
        mermaidToExcalidrawLib.api.then(() => {
          renderMermaid(restoredChat.generatedResponse!);
        });
      }

      setIsMenuOpen(false);
    };
  }, [restoreChat, applyChatToState, mermaidToExcalidrawLib, renderMermaid]);

  const handleDeleteChat = useCallback(
    (chatId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const isDeletingActiveChat = chatId === ttdSessionId;
      const updatedChats = deleteChat(chatId);
      if (isDeletingActiveChat) {
        if (updatedChats.length > 0) {
          const nextChat = updatedChats[0];
          applyChatToState(nextChat);

          if (nextChat.generatedResponse) {
            if (mermaidToExcalidrawLib.loaded) {
              renderMermaid(nextChat.generatedResponse!);
            } else {
              mermaidToExcalidrawLib.api.then(() => {
                renderMermaid(nextChat.generatedResponse!);
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
  }, [
    createNewChatId,
    setTtdSessionId,
    setChatHistory,
    setTtdGeneration,
  ]);

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
              <label>Chat</label>
              <Tooltip
                label={
                  "Currently we use Mermaid as a middle step, so you'll get best results if you describe a diagram, workflow, flow chart, and similar."
                }
                long
              >
                <button
                  type="button"
                  aria-label="Text-to-diagram help"
                  className="ttd-dialog-info"
                >
                  {HelpIconThin}
                </button>
              </Tooltip>
            </div>
            <div className="ttd-dialog-panel__menu-wrapper">
              <DropdownMenu open={isMenuOpen}>
                <DropdownMenu.Trigger
                  onToggle={() => setIsMenuOpen(!isMenuOpen)}
                  className="ttd-dialog-menu-trigger"
                  disabled={onTextSubmitInProgess}
                  title="Menu"
                  aria-label="Menu"
                >
                  {HamburgerMenuIcon}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  onClickOutside={() => setIsMenuOpen(false)}
                  onSelect={() => setIsMenuOpen(false)}
                  placement="bottom"
                >
                  <DropdownMenu.Item onSelect={handleNewChat}>
                    New Chat
                  </DropdownMenu.Item>
                  {savedChats.length > 0 && (
                    <>
                      <DropdownMenu.Separator />
                      {savedChats.map((chat) => (
                        <DropdownMenu.ItemCustom
                          key={chat.id}
                          className="ttd-chat-menu-item"
                          onClick={() => {
                            if (restoreChatRef.current) {
                              restoreChatRef.current(chat);
                            }
                          }}
                        >
                          <span className="ttd-chat-menu-item__title">
                            {chat.title}
                          </span>
                          <button
                            className="ttd-chat-menu-item__delete"
                            onClick={(e) => handleDeleteChat(chat.id, e)}
                            title="Delete chat"
                            aria-label="Delete chat"
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
        }
        className="ttd-dialog-chat-panel"
      >
        <ChatInterface
          messages={chatHistory.messages}
          currentPrompt={chatHistory.currentPrompt}
          onPromptChange={handlePromptChange}
          onSendMessage={onGenerate}
          isGenerating={onTextSubmitInProgess}
          rateLimits={rateLimits}
          generatedResponse={ttdGeneration?.generatedResponse}
          onAbort={handleAbort}
          bottomRightContent={
            <>
              {ttdGeneration?.generatedResponse && (
                <button
                  className="chat-interface__mermaid-link"
                  onClick={onViewAsMermaid}
                  type="button"
                >
                  View as Mermaid
                  <InlineIcon icon={ArrowRightIcon} />
                </button>
              )}
            </>
          }
          placeholder={{
            title: "Let's design your diagram",
            description:
              "Describe the diagram you want to create, and I'll generate it for you.",
          }}
        />
      </TTDDialogPanel>
      {showPreview && (
        <TTDDialogPanel
          label="Preview"
          panelActionOrientation="right"
          panelAction={{
            action: () => {
              insertToEditor({ app, data });
            },
            label: "Insert",
            icon: ArrowRightIcon,
          }}
          className="ttd-dialog-preview-panel"
        >
          <TTDDialogOutput
            canvasRef={someRandomDivRef}
            error={error}
            loaded={mermaidToExcalidrawLib.loaded}
          />
        </TTDDialogPanel>
      )}
    </div>
  );
};

export default TextToDiagram;
