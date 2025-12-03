export interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isGenerating?: boolean;
  error?: string;
  errorDetails?: string;
  errorType?: "parse" | "network" | "other";
}

export interface ChatHistory {
  messages: ChatMessage[];
  currentPrompt: string;
}

export interface ChatInterfaceProps {
  messages: ChatMessage[];
  currentPrompt: string;
  onPromptChange: (prompt: string) => void;
  onSendMessage: (message: string) => void;
  isGenerating: boolean;
  rateLimits?: {
    rateLimit: number;
    rateLimitRemaining: number;
  } | null;
  onViewAsMermaid?: () => void;
  generatedResponse?: string | null;
  placeholder: {
    title: string;
    description: string;
  };
  onAbort?: () => void;
  onMermaidTabClick?: (message: ChatMessage) => void;
  onAiRepairClick?: (message: ChatMessage) => void;
  onDeleteMessage?: (messageId: string) => void;
}
