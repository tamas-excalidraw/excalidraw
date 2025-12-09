import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import { randomId } from "@excalidraw/common";

import { atom, useAtom } from "../../editor-jotai";
import { useChatAgent } from "../Chat";

import { useTTDChatStorage } from "./useTTDChatStorage";

import type { MermaidToExcalidrawLibProps } from "./common";
import type { ChatMessageType } from "../Chat";
import type { BinaryFiles } from "../../types";
import type { TTDPayload, OnTestSubmitRetValue, RateLimits } from "./types";

const rateLimitsAtom = atom<RateLimits | null>(null);

const ttdGenerationAtom = atom<{
  generatedResponse: string | null;
  prompt: string | null;
  validMermaidContent: string | null;
} | null>(null);

const ttdSessionIdAtom = atom<string>(randomId());

interface TTDContextValue {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit: (payload: TTDPayload) => Promise<OnTestSubmitRetValue>;

  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  error: Error | null;
  setError: (error: Error | null) => void;

  ttdSessionId: string;
  setTtdSessionId: (id: string) => void;
  ttdGeneration: {
    generatedResponse: string | null;
    prompt: string | null;
    validMermaidContent: string | null;
  } | null;
  setTtdGeneration: (
    updater:
      | ((
          prev: {
            generatedResponse: string | null;
            prompt: string | null;
            validMermaidContent: string | null;
          } | null,
        ) => {
          generatedResponse: string | null;
          prompt: string | null;
          validMermaidContent: string | null;
        } | null)
      | {
          generatedResponse: string | null;
          prompt: string | null;
          validMermaidContent: string | null;
        }
      | null,
  ) => void;
  rateLimits: RateLimits | null;
  setRateLimits: (limits: RateLimits | null) => void;

  canvasRef: React.RefObject<HTMLDivElement | null>;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;

  addUserAndPendingAssistant: (
    prompt: string,
    addMessage: (message: Omit<ChatMessageType, "id" | "timestamp">) => void,
  ) => void;
  setAssistantError: (
    updateLastMessage: (
      updates: Partial<ChatMessageType>,
      type?: ChatMessageType["type"],
    ) => void,
    setError: (error: Error | null) => void,
    message: string,
    errorType: "network" | "parse" | "other",
  ) => void;
  updateAssistantContent: (
    updateLastMessage: (
      updates: Partial<ChatMessageType>,
      type?: ChatMessageType["type"],
    ) => void,
    chunk: string,
  ) => void;
  chatHistory: {
    messages: ChatMessageType[];
    currentPrompt: string;
  };
  setChatHistory: React.Dispatch<
    React.SetStateAction<{
      messages: ChatMessageType[];
      currentPrompt: string;
    }>
  >;

  savedChats: ReturnType<typeof useTTDChatStorage>["savedChats"];
  saveCurrentChat: () => void;
  deleteChat: (
    chatId: string,
  ) => ReturnType<typeof useTTDChatStorage>["savedChats"];
  restoreChat: ReturnType<typeof useTTDChatStorage>["restoreChat"];
  createNewChatId: () => string;

  addMessage: (message: Omit<ChatMessageType, "id" | "timestamp">) => void;
}

const TTDContext = createContext<TTDContextValue | null>(null);

export const useTTDContext = () => {
  const ctx = useContext(TTDContext);
  if (!ctx) {
    throw new Error("useTTDContext must be used within TTDProvider");
  }
  return ctx;
};

interface TTDProviderProps {
  children: ReactNode;
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit: (payload: TTDPayload) => Promise<OnTestSubmitRetValue>;
}

export const TTDProvider = ({
  children,
  mermaidToExcalidrawLib,
  onTextSubmit,
}: TTDProviderProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [ttdSessionId, setTtdSessionId] = useAtom(ttdSessionIdAtom);
  const [ttdGeneration, setTtdGenerationAtom] = useAtom(ttdGenerationAtom);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);

  const canvasRef = useRef<HTMLDivElement>(null);
  const data = useRef<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>({ elements: [], files: null });

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

  const addMessage = useCallback(
    (message: Omit<ChatMessageType, "id" | "timestamp">) => {
      const newMessage: ChatMessageType = {
        ...message,
        id: randomId(),
        timestamp: new Date(),
      };

      setChatHistory((prev) => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));
    },
    [setChatHistory],
  );

  const setTtdGeneration = useCallback(
    (
      updater:
        | ((
            prev: {
              generatedResponse: string | null;
              prompt: string | null;
              validMermaidContent: string | null;
            } | null,
          ) => {
            generatedResponse: string | null;
            prompt: string | null;
            validMermaidContent: string | null;
          } | null)
        | {
            generatedResponse: string | null;
            prompt: string | null;
            validMermaidContent: string | null;
          }
        | null,
    ) => {
      if (typeof updater === "function") {
        setTtdGenerationAtom(updater);
      } else {
        setTtdGenerationAtom(() => updater);
      }
    },
    [setTtdGenerationAtom],
  );

  const value = useMemo<TTDContextValue>(
    () => ({
      mermaidToExcalidrawLib,
      onTextSubmit,

      showPreview,
      setShowPreview,
      error,
      setError,

      ttdSessionId,
      setTtdSessionId,
      ttdGeneration,
      setTtdGeneration,
      rateLimits,
      setRateLimits,

      canvasRef,
      data,

      addUserAndPendingAssistant,
      setAssistantError,
      updateAssistantContent,
      chatHistory,
      setChatHistory,

      savedChats,
      saveCurrentChat,
      deleteChat,
      restoreChat,
      createNewChatId,

      addMessage,
    }),
    [
      mermaidToExcalidrawLib,
      onTextSubmit,
      showPreview,
      error,
      ttdSessionId,
      setTtdSessionId,
      ttdGeneration,
      setTtdGeneration,
      rateLimits,
      setRateLimits,
      addUserAndPendingAssistant,
      setAssistantError,
      updateAssistantContent,
      chatHistory,
      setChatHistory,
      savedChats,
      saveCurrentChat,
      addMessage,
      deleteChat,
      restoreChat,
      createNewChatId,
    ],
  );

  return <TTDContext.Provider value={value}>{children}</TTDContext.Provider>;
};
