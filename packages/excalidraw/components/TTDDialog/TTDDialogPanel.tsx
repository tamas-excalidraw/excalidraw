import clsx from "clsx";

import { Button } from "../Button";
import Spinner from "../Spinner";

import { Fragment, ReactNode } from "react";

type PanelAction = {
  label: string;
  action?: () => void;
  icon?: ReactNode;
  variant: "button" | "link" | "rateLimit";
};

interface TTDDialogPanelProps {
  label: string | ReactNode;
  children: ReactNode;
  panelActions?: Array<PanelAction>;
  panelActionDisabled?: boolean;
  onTextSubmitInProgess?: boolean;
  renderTopRight?: () => ReactNode;
  renderSubmitShortcut?: () => ReactNode;
  renderBottomRight?: () => ReactNode;
  className?: string;
  panelActionJustifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
}

export const TTDDialogPanel = ({
  label,
  children,
  panelActions = [],
  panelActionDisabled = false,
  onTextSubmitInProgess,
  renderTopRight,
  renderSubmitShortcut,
  renderBottomRight,
  className,
  panelActionJustifyContent = "flex-start",
}: TTDDialogPanelProps) => {
  const renderPanelAction = (panelAction: PanelAction) => {
    if (panelAction?.variant === "link") {
      return (
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
      );
    }

    if (panelAction?.variant === "button") {
      return (
        <Button
          className="ttd-dialog-panel-button"
          onSelect={panelAction.action ? panelAction.action : () => {}}
          disabled={panelActionDisabled || onTextSubmitInProgess}
        >
          <div className={clsx({ invisible: onTextSubmitInProgess })}>
            {panelAction?.label}
            {panelAction?.icon && <span>{panelAction.icon}</span>}
          </div>
          {onTextSubmitInProgess && <Spinner />}
        </Button>
      );
    }

    if (panelAction?.variant === "rateLimit") {
      return (
        <div className="ttd-dialog-panel__rate-limit">{panelAction.label}</div>
      );
    }
  };

  return (
    <div className={clsx("ttd-dialog-panel", className)}>
      <div className="ttd-dialog-panel__header">
        {typeof label === "string" ? <label>{label}</label> : label}
        {renderTopRight?.()}
      </div>
      {children}
      <div
        className={clsx("ttd-dialog-panel-button-container", {
          invisible: !panelActions.length,
        })}
        style={{
          justifyContent: panelActionJustifyContent,
        }}
      >
        {panelActions.filter(Boolean).map((panelAction) => (
          <Fragment key={panelAction.label}>
            {renderPanelAction(panelAction)}
          </Fragment>
        ))}
        {!panelActionDisabled &&
          !onTextSubmitInProgess &&
          renderSubmitShortcut?.()}
        {renderBottomRight?.()}
      </div>
    </div>
  );
};
