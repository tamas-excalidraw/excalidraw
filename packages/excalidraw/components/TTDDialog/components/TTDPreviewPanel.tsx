import { t } from "../../../i18n";
import { ArrowRightIcon } from "../../icons";
import { TTDDialogPanel } from "../TTDDialogPanel";
import { TTDDialogOutput } from "../TTDDialogOutput";
import { useAtom } from "../../../editor-jotai";

interface TTDPreviewPanelProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  error: Error | null;
  loaded: boolean;
  showPreview: boolean;
  onInsert: () => void;
  onReplay: () => void;
  isReplayDisabled: boolean;
}

export const TTDPreviewPanel = ({
  canvasRef,
  error,
  loaded,
  showPreview,
  onInsert,
  onReplay,
  isReplayDisabled,
}: TTDPreviewPanelProps) => {
  const getPreviewLabel = () => {
    return (
      <div className="ttd-dialog-panel__header">
        <label>{t("chat.preview")}</label>
      </div>
    );
  };

  return (
    <TTDDialogPanel
      label={getPreviewLabel()}
      panelActionJustifyContent="flex-end"
      panelActions={
        showPreview
          ? [
              {
                action: onInsert,
                label: t("chat.insert"),
                icon: ArrowRightIcon,
                variant: "button",
              },
            ]
          : undefined
      }
      renderTopRight={() => (
        <button
          onClick={onReplay}
          disabled={isReplayDisabled}
          className="ttd-replay-button"
          type="button"
          title="Replay"
        >
          Replay
        </button>
      )}
      className={`ttd-dialog-preview-panel ${
        showPreview ? "" : "ttd-dialog-preview-panel--hidden"
      }`}
    >
      <TTDDialogOutput canvasRef={canvasRef} error={error} loaded={loaded} />
    </TTDDialogPanel>
  );
};
