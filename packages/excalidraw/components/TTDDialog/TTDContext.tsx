import { randomId } from "@excalidraw/common";
import { createRef } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { atom } from "../../editor-jotai";

import type { RateLimits } from "./types";
import type { BinaryFiles } from "../../types";

type TTDGeneration = {
  generatedResponse: string | null;
  prompt: string | null;
  validMermaidContent: string | null;
} | null;

export const rateLimitsAtom = atom<RateLimits | null>(null);

export const ttdGenerationAtom = atom<TTDGeneration>(null);

export const ttdSessionIdAtom = atom<string>(randomId());

export const showPreviewAtom = atom<boolean>(false);

export const errorAtom = atom<Error | null>(null);

export const ttdCanvasRefAtom = atom<React.RefObject<HTMLDivElement | null>>(
  createRef<HTMLDivElement>(),
);

export const ttdDataAtom = atom<
  React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>
>({
  current: { elements: [], files: null },
});
