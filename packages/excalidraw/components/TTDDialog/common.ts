import { DEFAULT_EXPORT_PADDING, EDITOR_LS_KEYS } from "@excalidraw/common";

import { validateMermaid } from "@excalidraw/mermaid-to-excalidraw";
import type { MermaidConfig } from "@excalidraw/mermaid-to-excalidraw";
import type { MermaidToExcalidrawResult } from "@excalidraw/mermaid-to-excalidraw/dist/interfaces";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { EditorLocalStorage } from "../../data/EditorLocalStorage";
import { canvasToBlob } from "../../data/blob";
import { t } from "../../i18n";
import { convertToExcalidrawElements, exportToCanvas } from "../../index";

import type { AppClassProperties, BinaryFiles } from "../../types";

const resetPreview = ({
  canvasRef,
  setError,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setError: (error: Error | null) => void;
}) => {
  const canvasNode = canvasRef.current;

  if (!canvasNode) {
    return;
  }
  const parent = canvasNode.parentElement;
  if (!parent) {
    return;
  }
  parent.style.background = "";
  setError(null);
  canvasNode.replaceChildren();
};

export interface MermaidToExcalidrawLibProps {
  loaded: boolean;
  api: Promise<{
    parseMermaidToExcalidraw: (
      definition: string,
      config?: MermaidConfig,
    ) => Promise<MermaidToExcalidrawResult>;
  }>;
}

interface ConvertMermaidToExcalidrawFormatProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  mermaidDefinition: string;
  setError: (error: Error | null) => void;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;
  signal?: AbortSignal;
}

export const justValidateMermaid = async (mermaidDefinition: string) => {
  try {
    return validateMermaid(mermaidDefinition);
  } catch (err) {
    return validateMermaid(mermaidDefinition.replace(/"/g, "'"));
  }
};

export const convertMermaidToExcalidraw = async ({
  canvasRef,
  mermaidToExcalidrawLib,
  mermaidDefinition,
  setError,
  data,
  signal,
}: ConvertMermaidToExcalidrawFormatProps) => {
  const canvasNode = canvasRef.current;
  const parent = canvasNode?.parentElement;

  if (!canvasNode || !parent) {
    return;
  }

  if (!mermaidDefinition) {
    resetPreview({ canvasRef, setError });
    return;
  }

  // Check if already aborted
  if (signal?.aborted) {
    return;
  }

  let ret;
  try {
    const isValid = await validateMermaid(mermaidDefinition);

    if (signal?.aborted) {
      return;
    }

    if (!isValid) {
      return;
    }

    const api = await mermaidToExcalidrawLib.api;

    try {
      ret = await api.parseMermaidToExcalidraw(mermaidDefinition);
    } catch (err: any) {
      if (signal?.aborted) {
        return;
      }
      ret = await api.parseMermaidToExcalidraw(
        mermaidDefinition.replace(/"/g, "'"),
      );
    }

    if (signal?.aborted) {
      return;
    }

    if (!ret) {
      return;
    }

    const { elements, files } = ret;
    setError(null);

    data.current = {
      elements: convertToExcalidrawElements(elements, {
        regenerateIds: true,
      }),
      files,
    };

    if (signal?.aborted) {
      return;
    }

    const canvas = await exportToCanvas({
      elements: data.current.elements,
      files: data.current.files,
      exportPadding: DEFAULT_EXPORT_PADDING,
      maxWidthOrHeight:
        Math.max(parent.offsetWidth, parent.offsetHeight) *
        window.devicePixelRatio,
    });

    if (signal?.aborted) {
      return;
    }
    // if converting to blob fails, there's some problem that will
    // likely prevent preview and export (e.g. canvas too big)
    try {
      // await canvasToBlob(canvas);
    } catch (e: any) {
      if (e.name === "CANVAS_POSSIBLY_TOO_BIG") {
        throw new Error(t("canvasError.canvasTooBig"));
      }
      throw e;
    }
    if (signal?.aborted) {
      return;
    }

    parent.style.background = "var(--default-bg-color)";
    canvasNode.replaceChildren(canvas);
  } catch (err: any) {
    // Don't throw if aborted - it's expected
    if (signal?.aborted) {
      return;
    }
    parent.style.background = "var(--default-bg-color)";
    if (mermaidDefinition) {
      setError(err);
    }

    throw err;
  }
};

export const saveMermaidDataToStorage = (mermaidDefinition: string) => {
  EditorLocalStorage.set(
    EDITOR_LS_KEYS.MERMAID_TO_EXCALIDRAW,
    mermaidDefinition,
  );
};

export const insertToEditor = ({
  app,
  data,
  text,
  shouldSaveMermaidDataToStorage,
}: {
  app: AppClassProperties;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;
  text?: string;
  shouldSaveMermaidDataToStorage?: boolean;
}) => {
  const { elements: newElements, files } = data.current;

  if (!newElements.length) {
    return;
  }

  app.addElementsFromPasteOrLibrary({
    elements: newElements,
    files,
    position: "center",
    fitToContent: true,
  });
  app.setOpenDialog(null);

  if (shouldSaveMermaidDataToStorage && text) {
    saveMermaidDataToStorage(text);
  }
};
