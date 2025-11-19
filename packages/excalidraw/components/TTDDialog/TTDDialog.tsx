import { useEffect, useRef, useState, useCallback } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { trackEvent } from "../../analytics";
import { useUIAppState } from "../../context/ui-appState";
import { atom, useAtom } from "../../editor-jotai";
import { t } from "../../i18n";
import { useApp, useExcalidrawSetAppState } from "../App";
import { Dialog } from "../Dialog";
import { withInternalFallback } from "../hoc/withInternalFallback";
import {
  ArrowRightIcon,
  HelpIconThin,
  HamburgerMenuIcon,
  TrashIcon,
} from "../icons";
import { Tooltip } from "../Tooltip";
import DropdownMenu from "../dropdownMenu/DropdownMenu";

import MermaidToExcalidraw from "./MermaidToExcalidraw";
import TTDDialogTabs from "./TTDDialogTabs";
import { TTDDialogTabTriggers } from "./TTDDialogTabTriggers";
import { TTDDialogTabTrigger } from "./TTDDialogTabTrigger";
import { TTDDialogTab } from "./TTDDialogTab";
import { TTDDialogOutput } from "./TTDDialogOutput";
import { TTDDialogPanel } from "./TTDDialogPanel";
import { ChatInterface, useChatAgent } from "../Chat";
import { InlineIcon } from "../InlineIcon";
import { useTTDChatStorage } from "./useTTDChatStorage";

import {
  convertMermaidToExcalidraw,
  insertToEditor,
  justValidateMermaid,
  saveMermaidDataToStorage,
} from "./common";

import "./TTDDialog.scss";

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

const ttdSessionIdAtom = atom<string>(
  Math.random().toString(36).substring(2, 15),
);

type OnTestSubmitRetValue = {
  rateLimit?: number | null;
  rateLimitRemaining?: number | null;
} & (
  | { generatedResponse: string | undefined; error?: null | undefined }
  | {
      error: Error;
      generatedResponse?: null | undefined;
    }
);

type TTDPayload = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  onChunk?: (chunk: string) => void;
};

export const TTDDialog = (
  props:
    | {
        onTextSubmit(payload: TTDPayload): Promise<OnTestSubmitRetValue>;
      }
    | { __fallback: true },
) => {
  const appState = useUIAppState();

  if (appState.openDialog?.name !== "ttd") {
    return null;
  }

  return <TTDDialogBase {...props} tab={appState.openDialog.tab} />;
};

/**
 * Text to diagram (TTD) dialog
 */
export const TTDDialogBase = withInternalFallback(
  "TTDDialogBase",
  ({
    tab,
    ...rest
  }: {
    tab: "text-to-diagram" | "mermaid";
  } & (
    | {
        onTextSubmit(value: TTDPayload): Promise<OnTestSubmitRetValue>;
      }
    | { __fallback: true }
  )) => {
    const app = useApp();
    const setAppState = useExcalidrawSetAppState();

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
        id: Math.random().toString(36).substring(2, 9),
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

    const onGenerate = async (promptWithContext: string) => {
      if (
        promptWithContext.length > MAX_PROMPT_LENGTH ||
        promptWithContext.length < MIN_PROMPT_LENGTH ||
        onTextSubmitInProgess ||
        rateLimits?.rateLimitRemaining === 0 ||
        // means this is not a text-to-diagram dialog (needed for TS onlyisCheckoutPage)
        "__fallback" in rest
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
            new Error(
              `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters)`,
            ),
          );
        }

        return;
      }

      addUserAndPendingAssistant(promptWithContext, addMessage);

      accumulatedContentRef.current = "";

      setTimeout(() => {
        setShowPreview(true);
      }, 200);

      try {
        setOnTextSubmitInProgess(true);

        trackEvent("ai", "generate", "ttd");

        const { generatedResponse, error, rateLimit, rateLimitRemaining } =
          await rest.onTextSubmit({
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

        try {
          const isValid = await justValidateMermaid(generatedResponse);

          if (isValid) {
            trackEvent("ai", "mermaid parse success", "ttd");
          } else {
            console.info(
              `%cTTD mermaid render error: Invalid diagram`,
              "color: red",
            );
            trackEvent("ai", "mermaid parse failed", "ttd");
            updateLastMessage({
              isGenerating: false,
              error:
                "Generated an invalid diagram :(. You may also try a different prompt.",
            });
            setError(
              new Error(
                "Generated an invalid diagram :(. You may also try a different prompt.",
              ),
            );
          }
        } catch (error: any) {
          console.info(
            `%cTTD mermaid render error: ${error.message}`,
            "color: red",
          );
          console.info(
            `>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\nTTD mermaid definition render error: ${error.message}`,
            "color: yellow",
          );
          trackEvent("ai", "mermaid parse failed", "ttd");
          updateLastMessage({
            isGenerating: false,
            error:
              "Generated an invalid diagram :(. You may also try a different prompt.",
          });
          setError(
            new Error(
              "Generated an invalid diagram :(. You may also try a different prompt.",
            ),
          );
        }
      } catch (error: any) {
        let message: string | undefined = error.message;
        if (!message || message === "Failed to fetch") {
          message = "Request failed";
        }
        updateLastMessage({
          isGenerating: false,
          error: message,
        });
        setError(new Error(message));
      } finally {
        setOnTextSubmitInProgess(false);
      }
    };

    const [mermaidToExcalidrawLib, setMermaidToExcalidrawLib] =
      useState<MermaidToExcalidrawLibProps>({
        loaded: false,
        api: import("@excalidraw/mermaid-to-excalidraw"),
      });

    useEffect(() => {
      const fn = async () => {
        await mermaidToExcalidrawLib.api;
        setMermaidToExcalidrawLib((prev) => ({ ...prev, loaded: true }));
      };
      fn();
    }, [mermaidToExcalidrawLib.api]);

    const data = useRef<{
      elements: readonly NonDeletedExcalidrawElement[];
      files: BinaryFiles | null;
    }>({ elements: [], files: null });

    const [error, setErrorr] = useState<Error | null>(null);
    const accumulatedContentRef = useRef<string>("");
    const abortControllerRef = useRef<AbortController | null>(null);

    const setError = (error: any) => {
      if (error) {
        console.trace("### setError", error);
      }
      setErrorr(error);
    };

    const renderMermaid = useCallback(
      async (mermaidDefinition: string) => {
        if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
          return false;
        }

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

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

        // Render the preview if there's a generated response
        if (restoredChat.generatedResponse) {
          if (mermaidToExcalidrawLib.loaded) {
            // Render immediately if library is loaded
            setTimeout(() => {
              renderMermaid(restoredChat.generatedResponse!);
            }, 100);
          } else {
            // Wait for library to load, then render
            mermaidToExcalidrawLib.api.then(() => {
              renderMermaid(restoredChat.generatedResponse!);
            });
          }
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

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleNewChat = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

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

      setIsMenuOpen(false);
    };

    return (
      <Dialog
        className="ttd-dialog"
        onCloseRequest={() => {
          app.setOpenDialog(null);
        }}
        size={1200}
        title={false}
        {...rest}
        autofocus={false}
      >
        <TTDDialogTabs dialog="ttd" tab={tab}>
          {"__fallback" in rest && rest.__fallback ? (
            <p className="dialog-mermaid-title">{t("mermaid.title")}</p>
          ) : (
            <TTDDialogTabTriggers>
              <TTDDialogTabTrigger tab="text-to-diagram">
                <div style={{ display: "flex", alignItems: "center" }}>
                  {t("labels.textToDiagram")}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1px 6px",
                      marginLeft: "10px",
                      fontSize: 10,
                      borderRadius: "12px",
                      background: "var(--color-promo)",
                      color: "var(--color-surface-lowest)",
                    }}
                  >
                    AI Beta
                  </div>
                </div>
              </TTDDialogTabTrigger>
              <TTDDialogTabTrigger tab="mermaid">Mermaid</TTDDialogTabTrigger>
            </TTDDialogTabTriggers>
          )}

          <TTDDialogTab className="ttd-dialog-content" tab="mermaid">
            <MermaidToExcalidraw
              mermaidToExcalidrawLib={mermaidToExcalidrawLib}
            />
          </TTDDialogTab>
          {!("__fallback" in rest) && (
            <TTDDialogTab className="ttd-dialog-content" tab="text-to-diagram">
              <div
                className={`ttd-dialog-layout ${
                  showPreview
                    ? "ttd-dialog-layout--split"
                    : "ttd-dialog-layout--chat-only"
                }`}
              >
                <TTDDialogPanel
                  label={
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", gap: 5 }}>
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
                      <div style={{ position: "relative" }}>
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
                                      onClick={(e) =>
                                        handleDeleteChat(chat.id, e)
                                      }
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
                    panelAction={{
                      action: () => {
                        console.info("Panel action clicked");
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
            </TTDDialogTab>
          )}
        </TTDDialogTabs>
      </Dialog>
    );
  },
);
