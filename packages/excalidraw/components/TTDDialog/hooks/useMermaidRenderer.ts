import { useEffect, useMemo, useRef } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../../../editor-jotai";

import { chatHistoryAtom, errorAtom } from "../TTDContext";
import { convertMermaidToExcalidraw } from "../common";
import { isValidMermaidSyntax } from "../utils/mermaidValidation";

import type { BinaryFiles } from "../../../types";
import type { MermaidToExcalidrawLibProps } from "../common";
import { ChatMessage } from "../../Chat/types";
import { updateAssistantContent } from "../utils/chat";

const FAST_THROTTLE_DELAY = 300;
const SLOW_THROTTLE_DELAY = 3000;
const RENDER_SPEED_THRESHOLD = 100;
const PARSE_FAIL_DELAY = 100;

interface ThrottledFunction {
  (content: string): Promise<void>;
  flush: () => Promise<void>;
  cancel: () => void;
}

interface UseMermaidRendererProps {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

export const useMermaidRenderer = ({
  mermaidToExcalidrawLib,
  canvasRef,
}: UseMermaidRendererProps) => {
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [, setError] = useAtom(errorAtom);

  const isRenderingRef = useRef(false);
  const pendingRenderContentRef = useRef<string | null>(null);

  const lastAssistantMessage = useMemo(() => {
    return chatHistory.messages.reduce(
      (soFar: null | ChatMessage, curr) =>
        curr.type === "assistant" ? curr : soFar,
      null,
    );
  }, [chatHistory?.messages]);

  const data = useRef<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>({
    elements: [],
    files: null,
  });

  const lastRenderTimeRef = useRef(0);
  const pendingContentRef = useRef<string | null>(null);
  const hasErrorOffsetRef = useRef(false);
  const currentThrottleDelayRef = useRef(FAST_THROTTLE_DELAY);

  const renderMermaid = async (mermaidDefinition: string): Promise<boolean> => {
    if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
      return false;
    }

    if (isRenderingRef.current) {
      pendingRenderContentRef.current = mermaidDefinition;
      return false;
    }

    isRenderingRef.current = true;
    pendingRenderContentRef.current = null;

    const renderStartTime = performance.now();

    const result = await convertMermaidToExcalidraw({
      canvasRef,
      data,
      mermaidToExcalidrawLib,
      setError,
      mermaidDefinition,
    });

    const renderDuration = performance.now() - renderStartTime;

    if (renderDuration < RENDER_SPEED_THRESHOLD) {
      currentThrottleDelayRef.current = FAST_THROTTLE_DELAY;
    } else {
      currentThrottleDelayRef.current = SLOW_THROTTLE_DELAY;
    }

    if (result.success) {
      setChatHistory((prev) =>
        updateAssistantContent(prev, {
          validMermaidContent: mermaidDefinition,
        }),
      );
    }

    isRenderingRef.current = false;
    return result.success;
  };

  const throttledRenderMermaid: ThrottledFunction = async (content: string) => {
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;
    const throttleDelay = currentThrottleDelayRef.current;

    if (!isValidMermaidSyntax(content)) {
      if (!hasErrorOffsetRef.current) {
        lastRenderTimeRef.current = Math.max(
          lastRenderTimeRef.current,
          now - throttleDelay + PARSE_FAIL_DELAY,
        );
        hasErrorOffsetRef.current = true;
      }
      pendingContentRef.current = content;
      return;
    }

    hasErrorOffsetRef.current = false;

    if (timeSinceLastRender < throttleDelay) {
      pendingContentRef.current = content;
      return;
    }

    pendingContentRef.current = null;
    const success = await renderMermaid(content);
    lastRenderTimeRef.current = Date.now();

    if (!success) {
      lastRenderTimeRef.current =
        lastRenderTimeRef.current - throttleDelay + PARSE_FAIL_DELAY;
      hasErrorOffsetRef.current = true;
    }
  };

  throttledRenderMermaid.flush = async () => {
    if (pendingContentRef.current) {
      const content = pendingContentRef.current;
      pendingContentRef.current = null;
      await renderMermaid(content);
      lastRenderTimeRef.current = Date.now();
    }
  };

  throttledRenderMermaid.cancel = () => {
    pendingContentRef.current = null;
  };

  const resetThrottleState = () => {
    lastRenderTimeRef.current = 0;
    pendingContentRef.current = null;
    hasErrorOffsetRef.current = false;
    currentThrottleDelayRef.current = FAST_THROTTLE_DELAY;
  };

  useEffect(() => {
    if (lastAssistantMessage?.content) {
      throttledRenderMermaid(lastAssistantMessage.content);
    } else {
      const canvasNode = canvasRef.current;
      if (canvasNode) {
        const parent = canvasNode.parentElement;
        if (parent) {
          parent.style.background = "";
          canvasNode.replaceChildren();
        }
      }
    }
  }, [lastAssistantMessage]);

  useEffect(() => {
    return () => {
      throttledRenderMermaid.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    renderMermaid,
    throttledRenderMermaid,
    isRenderingRef,
    resetThrottleState,
  };
};
