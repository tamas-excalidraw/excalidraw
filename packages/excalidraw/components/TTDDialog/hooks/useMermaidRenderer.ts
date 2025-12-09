import { useCallback, useEffect, useMemo, useRef } from "react";
import throttle from "lodash.throttle";

import { useTTDContext } from "../TTDContext";
import { convertMermaidToExcalidraw } from "../common";
import { isValidMermaidSyntax } from "../utils/mermaidValidation";

interface ThrottledFunction {
  (content: string): Promise<void>;
  flush: () => void;
  cancel: () => void;
}

export const useMermaidRenderer = () => {
  const {
    mermaidToExcalidrawLib,
    canvasRef,
    data,
    setError,
    setTtdGeneration,
  } = useTTDContext();

  const isRenderingRef = useRef(false);
  const pendingRenderContentRef = useRef<string | null>(null);
  const lastRenderRuntimeRef = useRef(0);
  const shouldThrottleRef = useRef(false);
  const lastRenderFailedRef = useRef(false);

  const renderMermaid = useCallback(
    async (mermaidDefinition: string): Promise<boolean> => {
      if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
        return false;
      }

      if (isRenderingRef.current) {
        pendingRenderContentRef.current = mermaidDefinition;
        return false;
      }

      isRenderingRef.current = true;
      pendingRenderContentRef.current = null;

      const startTime = performance.now();
      const result = await convertMermaidToExcalidraw({
        canvasRef,
        data,
        mermaidToExcalidrawLib,
        setError,
        mermaidDefinition,
      });
      const endTime = performance.now();
      const runtime = endTime - startTime;
      lastRenderRuntimeRef.current = runtime;

      if (runtime > 100) {
        shouldThrottleRef.current = true;
      }

      if (result.success) {
        setTtdGeneration((s) => ({
          generatedResponse: s?.generatedResponse ?? null,
          prompt: s?.prompt ?? null,
          validMermaidContent: mermaidDefinition,
        }));
      }

      isRenderingRef.current = false;
      return result.success;
    },
    [mermaidToExcalidrawLib, setTtdGeneration, canvasRef, data, setError],
  );

  const throttledRenderMermaid: ThrottledFunction = useMemo(() => {
    const throttled = throttle(
      async (content: string) => {
        if (!isValidMermaidSyntax(content)) {
          lastRenderFailedRef.current = true;
          return;
        }
        const success = await renderMermaid(content);
        lastRenderFailedRef.current = !success;
      },
      3000,
      { leading: true, trailing: false },
    );

    const fn = async (content: string) => {
      if (lastRenderFailedRef.current) {
        lastRenderFailedRef.current = false;
        if (!isValidMermaidSyntax(content)) {
          lastRenderFailedRef.current = true;
          return;
        }
        const success = await renderMermaid(content);
        lastRenderFailedRef.current = !success;
      } else {
        throttled(content);
      }
    };

    fn.flush = () => {
      throttled.flush();
    };
    fn.cancel = () => {
      throttled.cancel();
    };

    return fn;
  }, [renderMermaid]);

  const fastThrottledRenderMermaid: ThrottledFunction = useMemo(() => {
    const throttled = throttle(
      async (content: string) => {
        if (!isValidMermaidSyntax(content)) {
          lastRenderFailedRef.current = true;
          return;
        }
        const success = await renderMermaid(content);
        lastRenderFailedRef.current = !success;
      },
      350,
      { leading: true, trailing: false },
    );

    const fn = async (content: string) => {
      if (lastRenderFailedRef.current) {
        lastRenderFailedRef.current = false;
        if (!isValidMermaidSyntax(content)) {
          lastRenderFailedRef.current = true;
          return;
        }
        const success = await renderMermaid(content);
        lastRenderFailedRef.current = !success;
      } else {
        throttled(content);
      }
    };

    fn.flush = () => {
      throttled.flush();
    };
    fn.cancel = () => {
      throttled.cancel();
    };

    return fn;
  }, [renderMermaid]);

  useEffect(() => {
    return () => {
      throttledRenderMermaid?.cancel();
      fastThrottledRenderMermaid?.cancel();
    };
  }, [throttledRenderMermaid, fastThrottledRenderMermaid]);

  const resetThrottleState = useCallback(() => {
    shouldThrottleRef.current = false;
    lastRenderFailedRef.current = false;
  }, []);

  return {
    renderMermaid,
    throttledRenderMermaid,
    fastThrottledRenderMermaid,
    shouldThrottleRef,
    isRenderingRef,
    resetThrottleState,
  };
};
