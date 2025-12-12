import { useAtom } from "../../editor-jotai";
import { chatHistoryAtom } from "../TTDDialog/TTDContext";
import { addMessages, updateAssistantContent } from "../TTDDialog/utils/chat";

export const useChatAgent = () => {
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);

  const addUserAndPendingAssistant = (content: string) => {
    setChatHistory(
      addMessages(chatHistory, [
        {
          type: "user",
          content,
        },
        {
          type: "assistant",
          content: "",
          isGenerating: true,
        },
      ]),
    );
  };

  const setAssistantError = (
    errorMessage: string,
    errorType: "parse" | "network" | "other" = "other",
    errorDetails?: Error | unknown,
  ) => {
    const serializedErrorDetails = errorDetails
      ? JSON.stringify({
          name: errorDetails instanceof Error ? errorDetails.name : "Error",
          message:
            errorDetails instanceof Error
              ? errorDetails.message
              : String(errorDetails),
          stack: errorDetails instanceof Error ? errorDetails.stack : undefined,
        })
      : undefined;

    setChatHistory(
      updateAssistantContent(chatHistory, {
        isGenerating: false,
        error: errorMessage,
        errorType,
        errorDetails: serializedErrorDetails,
        content: errorMessage,
      }),
    );
  };

  return {
    addUserAndPendingAssistant,
    setAssistantError,
    chatHistory,
    setChatHistory,
  };
};
