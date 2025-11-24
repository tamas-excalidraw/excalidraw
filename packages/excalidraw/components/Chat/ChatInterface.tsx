import React, { useRef, useEffect, useState } from "react";
import { KEYS } from "@excalidraw/common";
import { ArrowRightIcon, stop as StopIcon } from "../icons";
import { InlineIcon } from "../InlineIcon";
import { ChatMessage } from "./ChatMessage";
import { ChatInterfaceProps } from "./types";
import { SpeechRecognitionButton } from "../SpeechRecognition";

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  currentPrompt,
  onPromptChange,
  onSendMessage,
  isGenerating,
  rateLimits,
  bottomRightContent,
  placeholder,
  onAbort,
}) => {
  const [inputValue, setInputValue] = useState(currentPrompt);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSpeechTranscript = (transcript: string) => {
    setInputValue(transcript);
    onPromptChange(transcript);
  };

  const handleSpeechError = (error: string) => {
    console.error("Speech recognition error:", error);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setInputValue(value);
    onPromptChange(value);
  };

  const handleSubmit = () => {
    if (isGenerating && onAbort) {
      onAbort();
      return;
    }
    const trimmedPrompt = inputValue.trim();
    if (trimmedPrompt && !isGenerating) {
      onSendMessage(trimmedPrompt);
      setInputValue("");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === KEYS.ENTER && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const canSend =
    inputValue.trim().length > 0 &&
    !isGenerating &&
    (rateLimits?.rateLimitRemaining ?? 1) > 0;

  const canStop = isGenerating && !!onAbort;

  return (
    <div className="chat-interface">
      <div className="chat-interface__messages">
        {messages.length === 0 ? (
          <div className="chat-interface__empty-state">
            <div className="chat-interface__empty-state-content">
              <h3>{placeholder.title}</h3>
              <p>{placeholder.description}</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-interface__input-container">
        <div className="chat-interface__input-wrapper">
          <textarea
            autoFocus
            ref={inputRef}
            className="chat-interface__input"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Start typing your diagram idea here..."
            disabled={isGenerating}
            rows={1}
            cols={30}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <SpeechRecognitionButton
            onTranscript={handleSpeechTranscript}
            onError={handleSpeechError}
            disabled={isGenerating}
            className="chat-interface__speech-recognition"
            buttonClassName="chat-interface__voice-button"
          />
          <button
            className="chat-interface__send-button"
            onClick={handleSubmit}
            disabled={!canSend && !canStop}
            type="button"
          >
            <InlineIcon
              size="1.5em"
              icon={isGenerating ? StopIcon : ArrowRightIcon}
            />
          </button>
        </div>

        {(rateLimits || bottomRightContent) && (
          <div className="chat-interface__footer">
            <div className="chat-interface__footer-left">
              {rateLimits && (
                <div className="chat-interface__rate-limit">
                  {rateLimits?.rateLimitRemaining} requests left today
                </div>
              )}
            </div>

            <div className="chat-interface__footer-right">
              {bottomRightContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
