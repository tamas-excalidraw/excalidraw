import { randomId } from "@excalidraw/common";

import { atom } from "../../editor-jotai";

import type { ChatHistory } from "../Chat";

import type { RateLimits } from "./types";

type TTDGeneration = {
  generatedResponse: string | null;
  prompt: string | null;
  validMermaidContent: string | null;
} | null;

export const rateLimitsAtom = atom<RateLimits | null>(null);

export const ttdGenerationAtom = atom<TTDGeneration>(null);

export const showPreviewAtom = atom<boolean>(false);

export const errorAtom = atom<Error | null>(null);

export const chatHistoryAtom = atom<ChatHistory>({
  id: randomId(),
  messages: [],
  currentPrompt: "",
});
