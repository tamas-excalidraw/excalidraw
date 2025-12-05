import React from "react";
import { ChatMessage as ChatMessageType } from "./types";
import { t } from "../../i18n";
import { FilledButton } from "../FilledButton";
import { TrashIcon, mermaidLogoIcon, TableExportIcon } from "../icons";

interface ChatMessageProps {
  message: ChatMessageType;
  onMermaidTabClick?: (message: ChatMessageType) => void;
  onAiRepairClick?: (message: ChatMessageType) => void;
  onDeleteMessage?: (messageId: string) => void;
  onInsertMessage?: (message: ChatMessageType) => void;
  rateLimitRemaining?: number;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onMermaidTabClick,
  onAiRepairClick,
  onDeleteMessage,
  onInsertMessage,
  rateLimitRemaining,
}) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isMermaidError = message.errorType === "parse";

  if (message.type === "system") {
    return (
      <div className="chat-message chat-message--system">
        <div className="chat-message__content">
          <div className="chat-message__header">
            <span className="chat-message__role">{t("chat.role.system")}</span>
            <span className="chat-message__timestamp">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <div className="chat-message__body">
            <div className="chat-message__text">
              {message.content}
              <div style={{ marginTop: "10px" }}>
                <FilledButton
                  onClick={() => {
                    window.open(
                      `${
                        import.meta.env.VITE_APP_PLUS_LP
                      }/plus?utm_source=excalidraw&utm_medium=app&utm_content=chatBannerBanner#excalidraw-redirect`,
                      "_blank",
                      "noopener",
                    );
                  }}
                >
                  Upgrade to Plus
                </FilledButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-message chat-message--${message.type}`}>
      <div className="chat-message__content">
        <div className="chat-message__header">
          <span className="chat-message__role">
            {message.type === "user"
              ? t("chat.role.user")
              : t("chat.role.assistant")}
          </span>
          <span className="chat-message__timestamp">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div className="chat-message__body">
          {message.error ? (
            <div className="chat-message__error">
              {message.content}
              <p>{t("chat.errors.invalidDiagram")}</p>
              {isMermaidError && (
                <div className="chat-message__error-actions">
                  {onMermaidTabClick && (
                    <button
                      className="chat-message__error-link"
                      onClick={() => onMermaidTabClick(message)}
                      type="button"
                    >
                      {t("chat.errors.fixInMermaid")}
                    </button>
                  )}
                  {onAiRepairClick && (
                    <button
                      className="chat-message__error-link"
                      onClick={() => onAiRepairClick(message)}
                      disabled={rateLimitRemaining === 0}
                      type="button"
                    >
                      {t("chat.errors.aiRepair")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="chat-message__text">
              {message.content}
              {message.isGenerating && (
                <span className="chat-message__cursor">▋</span>
              )}
            </div>
          )}
        </div>
      </div>
      {message.type === "assistant" && (
        <div className="chat-message__actions">
          {!message.error && onInsertMessage && (
            <button
              className="chat-message__action"
              onClick={() => onInsertMessage(message)}
              type="button"
              aria-label={t("chat.insert")}
              title={t("chat.insert")}
            >
              {TableExportIcon}
            </button>
          )}
          {onMermaidTabClick && (
            <button
              className="chat-message__action"
              onClick={() => onMermaidTabClick(message)}
              type="button"
              aria-label={t("chat.viewAsMermaid")}
              title={t("chat.viewAsMermaid")}
            >
              {mermaidLogoIcon}
            </button>
          )}
          {onDeleteMessage && (
            <button
              className="chat-message__action chat-message__action--danger"
              onClick={() => onDeleteMessage(message.id)}
              type="button"
              aria-label={t("chat.deleteMessage")}
              title={t("chat.deleteMessage")}
            >
              {TrashIcon}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
