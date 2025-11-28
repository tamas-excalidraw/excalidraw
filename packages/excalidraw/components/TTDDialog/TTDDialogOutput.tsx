import Spinner from "../Spinner";
import { t } from "../../i18n";

const ErrorComp = ({ error }: { error: string }) => {
  return (
    <div
      data-testid="ttd-dialog-output-error"
      className="ttd-dialog-output-error"
    >
      {t("ttd.error")} <p>{error}</p>
    </div>
  );
};

interface TTDDialogOutputProps {
  error: Error | null;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  loaded: boolean;
}

export const TTDDialogOutput = ({
  error,
  canvasRef,
  loaded,
}: TTDDialogOutputProps) => {
  console.log("errro", error);
  return (
    <div className="ttd-dialog-output-wrapper">
      {error && <ErrorComp error={error.message} />}
      {loaded ? (
        <div className="ttd-dialog-output-canvas-container">
          <div
            ref={canvasRef}
            style={{
              opacity: error ? "0.15" : 1,
            }}
            className="ttd-dialog-output-canvas-content"
          />
        </div>
      ) : (
        <Spinner size="2rem" />
      )}
    </div>
  );
};
