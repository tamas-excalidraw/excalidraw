import { t } from "../../../i18n";
import { ArrowRightIcon } from "../../icons";
import { TTDDialogPanel } from "../TTDDialogPanel";
import { TTDDialogOutput } from "../TTDDialogOutput";

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
  console.log("TTDPreviewPanel rendered");
  return (
    <TTDDialogPanel
      label={t("chat.preview")}
      panelActionOrientation="right"
      panelAction={
        showPreview
          ? {
              action: onInsert,
              label: t("chat.insert"),
              icon: ArrowRightIcon,
            }
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
