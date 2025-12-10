import clsx from "clsx";

import { t } from "../../../i18n";
import { HamburgerMenuIcon, TrashIcon } from "../../icons";
import DropdownMenu from "../../dropdownMenu/DropdownMenu";

import type { SavedChat } from "../useTTDChatStorage";

interface ChatHistoryMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNewChat: () => void;
  onRestoreChat: (chat: SavedChat) => void;
  onDeleteChat: (chatId: string, event: React.MouseEvent) => void;
  savedChats: SavedChat[];
  activeSessionId: string;
  disabled?: boolean;
}

export const ChatHistoryMenu = ({
  isOpen,
  onToggle,
  onClose,
  onNewChat,
  onRestoreChat,
  onDeleteChat,
  savedChats,
  activeSessionId,
  disabled,
}: ChatHistoryMenuProps) => {
  return (
    <div className="ttd-dialog-panel__menu-wrapper">
      <DropdownMenu open={isOpen}>
        <DropdownMenu.Trigger
          onToggle={onToggle}
          className="ttd-dialog-menu-trigger"
          disabled={disabled}
          title={t("chat.menu")}
          aria-label={t("chat.menu")}
        >
          {HamburgerMenuIcon}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          onClickOutside={onClose}
          onSelect={onClose}
          placement="bottom"
        >
          <DropdownMenu.Item onSelect={onNewChat}>
            {t("chat.newChat")}
          </DropdownMenu.Item>
          {savedChats.length > 0 && (
            <>
              <DropdownMenu.Separator />
              {savedChats.map((chat) => (
                <DropdownMenu.ItemCustom
                  key={chat.id}
                  className={clsx("ttd-chat-menu-item", {
                    "ttd-chat-menu-item--active": chat.id === activeSessionId,
                  })}
                  onClick={() => {
                    onRestoreChat(chat);
                  }}
                >
                  <span className="ttd-chat-menu-item__title">
                    {chat.title}
                  </span>
                  <button
                    className="ttd-chat-menu-item__delete"
                    onClick={(e) => onDeleteChat(chat.id, e)}
                    title={t("chat.deleteChat")}
                    aria-label={t("chat.deleteChat")}
                    type="button"
                  >
                    {TrashIcon}
                  </button>
                </DropdownMenu.ItemCustom>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
};
