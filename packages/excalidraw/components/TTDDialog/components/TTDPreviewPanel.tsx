import { t } from "../../../i18n";
import { ArrowRightIcon } from "../../icons";
import { TTDDialogPanel } from "../TTDDialogPanel";
import { TTDDialogOutput } from "../TTDDialogOutput";
import { rateLimitsAtom } from "../TTDContext";
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
  const [rateLimits] = useAtom(rateLimitsAtom);

  const getPreviewLabel = () => {
    return (
      <div className="ttd-dialog-panel__header">
        <label>{t("chat.preview")}</label>
        {rateLimits && (
          <div className="ttd-dialog-panel__rate-limit">
            (
            {t("chat.rateLimitRemaining", {
              count: rateLimits.rateLimitRemaining,
            })}
            )
          </div>
        )}
      </div>
    );
  };

  return (
    <TTDDialogPanel
      label={getPreviewLabel()}
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
