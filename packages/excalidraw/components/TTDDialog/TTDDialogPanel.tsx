import clsx from "clsx";

import { Button } from "../Button";
import Spinner from "../Spinner";

import type { ReactNode } from "react";

interface TTDDialogPanelProps {
  label: string | ReactNode;
  children: ReactNode;
  panelAction?: {
    label: string;
    action: () => void;
    icon?: ReactNode;
    variant?: "button" | "link";
  };
  panelActionDisabled?: boolean;
  onTextSubmitInProgess?: boolean;
  renderTopRight?: () => ReactNode;
  renderSubmitShortcut?: () => ReactNode;
  renderBottomRight?: () => ReactNode;
  className?: string;
  panelActionOrientation?: "left" | "right";
}

export const TTDDialogPanel = ({
  label,
  children,
  panelAction,
  panelActionDisabled = false,
  onTextSubmitInProgess,
  renderTopRight,
  renderSubmitShortcut,
  renderBottomRight,
  className,
  panelActionOrientation = "left",
}: TTDDialogPanelProps) => {
  return (
    <div className={clsx("ttd-dialog-panel", className)}>
      <div className="ttd-dialog-panel__header">
        {typeof label === "string" ? <label>{label}</label> : label}
        {renderTopRight?.()}
      </div>
      {children}
      <div
        className={clsx("ttd-dialog-panel-button-container", {
          invisible: !panelAction,
        })}
        style={{
          justifyContent:
            panelActionOrientation === "left" ? "flex-start" : "flex-end",
        }}
      >
        {panelAction?.variant === "link" ? (
          <button
            className="ttd-dialog-panel-action-link"
            onClick={panelAction.action}
            disabled={panelActionDisabled || onTextSubmitInProgess}
            type="button"
          >
            {panelAction.label}
            {panelAction.icon && (
              <span className="ttd-dialog-panel-action-link__icon">
                {panelAction.icon}
              </span>
            )}
          </button>
        ) : (
          <Button
            className="ttd-dialog-panel-button"
            onSelect={panelAction ? panelAction.action : () => {}}
            disabled={panelActionDisabled || onTextSubmitInProgess}
          >
            <div className={clsx({ invisible: onTextSubmitInProgess })}>
              {panelAction?.label}
              {panelAction?.icon && <span>{panelAction.icon}</span>}
            </div>
            {onTextSubmitInProgess && <Spinner />}
          </Button>
        )}
        {!panelActionDisabled &&
          !onTextSubmitInProgess &&
          renderSubmitShortcut?.()}
        {renderBottomRight?.()}
      </div>
    </div>
  );
};
