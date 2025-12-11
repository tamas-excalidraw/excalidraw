import { t } from "../../../i18n";
import { ArrowRightIcon, HelpIconThin } from "../../icons";
import { Tooltip } from "../../Tooltip";
import { ChatInterface } from "../../Chat";
import { InlineIcon } from "../../InlineIcon";
import { TTDDialogPanel } from "../TTDDialogPanel";

import { ChatHistoryMenu } from "./ChatHistoryMenu";

import type { ChatMessageType } from "../../Chat";
import type { SavedChat } from "../useTTDChatStorage";

interface TTDChatPanelProps {
  messages: ChatMessageType[];
  currentPrompt: string;
  onPromptChange: (prompt: string) => void;
  onSendMessage: (message: string, isRepairFlow?: boolean) => void;
  isGenerating: boolean;
  generatedResponse: string | null | undefined;

  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onNewChat: () => void;
  onRestoreChat: (chat: SavedChat) => void;
  onDeleteChat: (chatId: string, event: React.MouseEvent) => void;
  savedChats: SavedChat[];
  activeSessionId: string;

  onAbort: () => void;
  onMermaidTabClick: (message: ChatMessageType) => void;
  onAiRepairClick: (message: ChatMessageType) => void;
  onDeleteMessage: (messageId: string) => void;
  onInsertMessage: (message: ChatMessageType) => void;

  hasValidMermaidContent: boolean;
  onViewAsMermaid: () => void;
}

export const TTDChatPanel = ({
  messages,
  currentPrompt,
  onPromptChange,
  onSendMessage,
  isGenerating,
  generatedResponse,
  isMenuOpen,
  onMenuToggle,
  onMenuClose,
  onNewChat,
  onRestoreChat,
  onDeleteChat,
  savedChats,
  activeSessionId,
  onAbort,
  onMermaidTabClick,
  onAiRepairClick,
  onDeleteMessage,
  onInsertMessage,
  hasValidMermaidContent,
  onViewAsMermaid,
}: TTDChatPanelProps) => {
  return (
    <TTDDialogPanel
      label={
        <div className="ttd-dialog-panel__label-wrapper">
          <div className="ttd-dialog-panel__label-group">
            <label>{t("chat.label")}</label>
            <Tooltip label={t("chat.helpTooltip")} long>
              <button
                type="button"
                aria-label={t("chat.helpAriaLabel")}
                className="ttd-dialog-info"
              >
                {HelpIconThin}
              </button>
            </Tooltip>
          </div>
          <div className="ttd-dialog-panel__header-right">
            <ChatHistoryMenu
              isOpen={isMenuOpen}
              onToggle={onMenuToggle}
              onClose={onMenuClose}
              onNewChat={onNewChat}
              onRestoreChat={onRestoreChat}
              onDeleteChat={onDeleteChat}
              savedChats={savedChats}
              activeSessionId={activeSessionId}
              disabled={isGenerating}
            />
          </div>
        </div>
      }
      className="ttd-dialog-chat-panel"
      panelActionOrientation="right"
      panelAction={
        hasValidMermaidContent
          ? {
              action: onViewAsMermaid,
              label: t("chat.viewAsMermaid"),
              icon: <InlineIcon icon={ArrowRightIcon} />,
              variant: "link",
            }
          : undefined
      }
    >
      <ChatInterface
        messages={messages}
        currentPrompt={currentPrompt}
        onPromptChange={onPromptChange}
        onSendMessage={onSendMessage}
        isGenerating={isGenerating}
        generatedResponse={generatedResponse}
        onAbort={onAbort}
        onMermaidTabClick={onMermaidTabClick}
        onAiRepairClick={onAiRepairClick}
        onDeleteMessage={onDeleteMessage}
        onInsertMessage={onInsertMessage}
        placeholder={{
          title: t("chat.placeholder.title"),
          description: t("chat.placeholder.description"),
        }}
      />
    </TTDDialogPanel>
  );
};
