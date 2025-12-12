import { t } from "../../../i18n";
import { ArrowRightIcon, HelpIconThin } from "../../icons";
import { Tooltip } from "../../Tooltip";
import { ChatInterface } from "../../Chat";
import { InlineIcon } from "../../InlineIcon";
import { TTDDialogPanel } from "../TTDDialogPanel";

import { ChatHistoryMenu } from "./ChatHistoryMenu";

import type { ChatMessageType } from "../../Chat";
import type { SavedChat } from "../useTTDChatStorage";
import { useAtom } from "../../../editor-jotai";
import { rateLimitsAtom } from "../TTDContext";

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
  const [rateLimits] = useAtom(rateLimitsAtom);

  const getPanelActions = () => {
    let actions = [];
    if (rateLimits) {
      actions.push({
        label: t("chat.rateLimitRemaining", {
          count: rateLimits.rateLimitRemaining,
        }),
        variant: "rateLimit" as const,
      });
    }
    if (hasValidMermaidContent) {
      actions.push({
        action: onViewAsMermaid,
        label: t("chat.viewAsMermaid"),
        icon: <InlineIcon icon={ArrowRightIcon} />,
        variant: "link" as const,
      });
    }

    return actions;
  };
  const actions = getPanelActions();

  const getPanelActionFlexProp = () => {
    if (actions.length === 2) {
      return "space-between";
    }
    if (actions.length === 1 && actions[0].variant === "rateLimit") {
      return "flex-start";
    }

    return "flex-end";
  };

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
      panelActionJustifyContent={getPanelActionFlexProp()}
      panelActions={actions}
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
