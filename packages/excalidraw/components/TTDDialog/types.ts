import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "../../types";
import type { MermaidToExcalidrawLibProps } from "./common";
import type { ChatMessageType } from "../Chat";

// API Types
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

export type MermaidData = {
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles | null;
};

export interface UseMermaidRendererProps {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setError: (error: Error | null) => void;
  setTtdGeneration: (
    updater: (
      prev: {
        generatedResponse: string | null;
        prompt: string | null;
        validMermaidContent: string | null;
      } | null,
    ) => {
      generatedResponse: string | null;
      prompt: string | null;
      validMermaidContent: string | null;
    } | null,
  ) => void;
}

export interface UseTextGenerationProps {
  onTextSubmit: (payload: TTDPayload) => Promise<OnTestSubmitRetValue>;
  chatMessages: ChatMessageType[];
  addMessage: (message: Omit<ChatMessageType, "id" | "timestamp">) => void;
  updateLastMessage: (
    updates: Partial<ChatMessageType>,
    type?: ChatMessageType["type"],
  ) => void;
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
  setChatHistory: React.Dispatch<
    React.SetStateAction<{
      messages: ChatMessageType[];
      currentPrompt: string;
    }>
  >;
  renderMermaid: (mermaidDefinition: string) => Promise<boolean>;
  throttledRenderMermaid: {
    (content: string): Promise<void>;
    flush: () => void;
    cancel: () => void;
  };
  fastThrottledRenderMermaid: {
    (content: string): Promise<void>;
    flush: () => void;
    cancel: () => void;
  };
  shouldThrottleRef: React.MutableRefObject<boolean>;
  setTtdGeneration: (
    updater: (
      prev: {
        generatedResponse: string | null;
        prompt: string | null;
        validMermaidContent: string | null;
      } | null,
    ) => {
      generatedResponse: string | null;
      prompt: string | null;
      validMermaidContent: string | null;
    } | null,
  ) => void;
  setError: (error: Error | null) => void;
  setShowPreview: (show: boolean) => void;
  saveCurrentChat: () => void;
  removeLastErrorMessage: () => void;
  updateAssistantContent: (
    updateLastMessage: (
      updates: Partial<ChatMessageType>,
      type?: ChatMessageType["type"],
    ) => void,
    chunk: string,
  ) => void;
}

export interface RateLimits {
  rateLimit: number;
  rateLimitRemaining: number;
}
