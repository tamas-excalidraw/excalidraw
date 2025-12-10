import { useEffect, useRef } from "react";
import { useAtom } from "../../../editor-jotai";
import type { MermaidToExcalidrawLibProps } from "../common";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "../../../types";

import { errorAtom, ttdGenerationAtom } from "../TTDContext";
import { convertMermaidToExcalidraw } from "../common";
import { isValidMermaidSyntax } from "../utils/mermaidValidation";

const THROTTLE_DELAY = 3000;
const PARSE_FAIL_DELAY = 100;

interface ThrottledFunction {
  (content: string): Promise<void>;
  flush: () => Promise<void>;
  cancel: () => void;
}

interface UseMermaidRendererProps {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;
}

export const useMermaidRenderer = ({
  mermaidToExcalidrawLib,
  canvasRef,
  data,
}: UseMermaidRendererProps) => {
  const [, setError] = useAtom(errorAtom);
  const [, setTtdGeneration] = useAtom(ttdGenerationAtom);

  const isRenderingRef = useRef(false);
  const pendingRenderContentRef = useRef<string | null>(null);

  const lastRenderTimeRef = useRef(0);
  const pendingContentRef = useRef<string | null>(null);
  const hasErrorOffsetRef = useRef(false);

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

    const result = await convertMermaidToExcalidraw({
      canvasRef,
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
    return result.success;
  };

  const throttledRenderMermaid: ThrottledFunction = async (content: string) => {
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;

    if (!isValidMermaidSyntax(content)) {
      if (!hasErrorOffsetRef.current) {
        lastRenderTimeRef.current = Math.max(
          lastRenderTimeRef.current,
          now - THROTTLE_DELAY + PARSE_FAIL_DELAY,
        );
        hasErrorOffsetRef.current = true;
      }
      pendingContentRef.current = content;
      return;
    }

    hasErrorOffsetRef.current = false;

    if (timeSinceLastRender < THROTTLE_DELAY) {
      pendingContentRef.current = content;
      return;
    }

    pendingContentRef.current = null;
    const success = await renderMermaid(content);
    lastRenderTimeRef.current = Date.now();

    if (!success) {
      lastRenderTimeRef.current =
        lastRenderTimeRef.current - THROTTLE_DELAY + PARSE_FAIL_DELAY;
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
  };

  useEffect(() => {
    return () => {
      throttledRenderMermaid.cancel();
    };
  }, []);

  return {
    renderMermaid,
    throttledRenderMermaid,
    isRenderingRef,
    resetThrottleState,
  };
};
