import React, { useState, useRef, useEffect } from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useAuth } from "./AuthContext";
import { getApiUrl } from "../config";
import { api } from "./api";
import "../styles/components/MessageItem.css";

// Import language support
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
import cpp from "react-syntax-highlighter/dist/esm/languages/hljs/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/hljs/csharp";
import php from "react-syntax-highlighter/dist/esm/languages/hljs/php";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import html from "react-syntax-highlighter/dist/esm/languages/hljs/xml";
import css from "react-syntax-highlighter/dist/esm/languages/hljs/css";
import ruby from "react-syntax-highlighter/dist/esm/languages/hljs/ruby";
import swift from "react-syntax-highlighter/dist/esm/languages/hljs/swift";
import go from "react-syntax-highlighter/dist/esm/languages/hljs/go";

// Register languages
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("swift", swift);
SyntaxHighlighter.registerLanguage("go", go);

function MessageItem({
  message,
  isCurrentUser,
  onTagMessage,
  isHovered,
  isHighlighted, // All matching search results
  isActiveHighlight, // Currently selected result
  onMouseEnter,
  onMouseLeave,
  roomColor,
  canDeleteMessages = false,
  onDeleteMessage,
  roomId,
}) {
  const { user, authUser } = useAuth();
  // Add state for copy button feedback
  const [copied, setCopied] = useState(false);
  // Add state for code/output toggle
  const [showOutput, setShowOutput] = useState(false);
  // Add state for loading while code is being executed
  const [executingCode, setExecutingCode] = useState(false);
  // Add state for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Helper function to get user identifier consistently
  const getUserIdentifier = () =>
    user?.username || user?.email || authUser?.username || authUser?.email || 'Anonymous';
  // Add state to store code execution output
  const [outputLines, setOutputLines] = useState([]);
  const [codeStdin, setCodeStdin] = useState("");
  const [userInput, setUserInput] = useState("");
  const [awaitingInput, setAwaitingInput] = useState(false);
  // Reference for terminal input
  const terminalInputRef = useRef(null);
  // Reference for output container scrolling
  const outputContainerRef = useRef(null);
  // Add this for message animation reference
  const messageRef = useRef(null);

  const messageKey =
    message.messageId || message._id || message.id || message.createdAt || '';

  const [isLocalHovered, setIsLocalHovered] = useState(false);
  const showActions = isLocalHovered || isHovered;

  // Scroll to bottom of output whenever it changes
  useEffect(() => {
    if (outputContainerRef.current) {
      outputContainerRef.current.scrollTop =
        outputContainerRef.current.scrollHeight;
    }
  }, [outputLines]);

  // Focus input when awaiting input
  useEffect(() => {
    if (awaitingInput && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [awaitingInput]);
  // Create a useEffect to handle message appearance animation reset
  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.style.animation = "none";
      void messageRef.current.offsetWidth; // Trigger reflow
      messageRef.current.style.animation = "";
    }
  }, [messageKey]);

  // Function to handle code copying
  const copyCodeToClipboard = () => {
    navigator.clipboard
      .writeText(message.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
      })
      .catch((err) => {
        console.error("Failed to copy code:", err);
      });
  };

  const messageNeedsStdin = (text) => /\binput\s*\(/.test(text || "") || /\bscanf\s*\(/.test(text || "");

  const runCode = async (stdin = codeStdin) => {
    setExecutingCode(true);
    setAwaitingInput(false);
    setOutputLines([{ text: `Running ${message.language} code...`, type: "info" }]);
    setShowOutput(true);

    try {
      const result = await api.executeCode({
        code: message.text,
        language: message.language,
        stdin,
      });

      if (result.needsStdin) {
        setAwaitingInput(true);
        setOutputLines([
          { text: result.output, type: "info" },
        ]);
        setExecutingCode(false);
        return;
      }

      if (result.output) {
        setOutputLines([
          { text: "Execution completed", type: "success" },
          ...(result.source ? [{ text: `via ${result.source}${result.fallback ? " (fallback)" : ""}`, type: "info" }] : []),
          { text: "Output:", type: "info" },
          { text: result.output, type: "output" },
          ...(result.memory ? [{ text: `Memory: ${result.memory}`, type: "info" }] : []),
          ...(result.cpuTime ? [{ text: `CPU Time: ${result.cpuTime}`, type: "info" }] : []),
        ]);
      } else if (result.error) {
        setOutputLines([
          { text: "Execution failed", type: "error" },
          { text: result.error, type: "error" },
        ]);
      }

      setExecutingCode(false);
    } catch (error) {
      setOutputLines([
        { text: "Error executing code", type: "error" },
        { text: error.message, type: "error" },
      ]);
      setExecutingCode(false);
    }
  };

  const executeCode = async () => {
    if (showOutput) {
      setShowOutput(false);
      return;
    }
    await runCode();
  };

  const handleInputSubmit = (e) => {
    e.preventDefault();
    const stdin = userInput.trim() || codeStdin.trim();
    if (!stdin) return;
    setCodeStdin(stdin);
    runCode(stdin);
    setUserInput("");
  };

  // Handle message deletion
  const handleDeleteMessage = async () => {
    if (window.confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
      try {
        const apiUrl = getApiUrl();
        const messageId = messageKey;
        const response = await fetch(`${apiUrl}/api/rooms/${roomId}/messages/${messageId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            username: getUserIdentifier()
          })
        });

        if (response.ok) {
          // Call the parent component's delete handler
          if (onDeleteMessage) {
            onDeleteMessage(messageId);
          }
        } else {
          const errorData = await response.json();
          alert(`Failed to delete message: ${errorData.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error deleting message:', error);
        alert('Error deleting message. Please try again.');
      }
    }
    setShowDeleteConfirm(false);
  };

  // Format timestamp
  const formattedTime = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
/*sohamghosh-jellylemonshake-23bps1146 */

  // Function to format message text with mentions
  const formatMessageWithMentions = (text) => {
    if (!text) return "";

    // Pattern to match @username format
    const mentionPattern = /@([a-zA-Z0-9_]+)/g;

    // Split the text by mention pattern and create parts array
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // Add the mention as a special span element
      parts.push(
        <span key={`mention-${match.index}`} className="user-mention">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div
      className={`message-item ${isCurrentUser ? "current-user" : ""} ${
        showActions ? "hovered" : ""
      } ${isHighlighted ? "highlighted" : ""} ${
        isActiveHighlight ? "active-highlight" : ""
      } ${message.local ? "local" : ""}`}
      onMouseEnter={() => {
        setIsLocalHovered(true);
        onMouseEnter(messageKey);
      }}
      onMouseLeave={() => {
        setIsLocalHovered(false);
        onMouseLeave();
      }}
    >
      {/*sohamghosh-jellylemonshake-23bps1146 *//* Always show sender name above message bubble */}
      <div
        className={`message-sender-name ${isCurrentUser ? "right" : "left"}`}
        style={{
          color:
            message.color ||
            (isCurrentUser ? "var(--light-text)" : "var(--secondary-color)"),
        }}
      >
        {message.user?.username || message.user || message.senderName || "Anonymous"}
        {isCurrentUser && " (You)"}
      </div>

      <div
        ref={messageRef}
        className={`message-bubble ${message.isCode ? "code-message" : ""} ${
          executingCode ? "code-executing" : ""
        }`}
        style={{
          backgroundColor: message.isCode
            ? "#282a36"
            : isCurrentUser
            ? roomColor || "var(--primary-color)"
            : "var(--background-light)",
          borderColor: isHighlighted ? roomColor || "#1e88e5" : "transparent",
          borderWidth: isHighlighted ? "2px" : "0",
          boxShadow: isActiveHighlight
            ? `0 0 8px ${roomColor || "#1e88e5"}`
            : "none",
        }}
      >
        {/* Show tag button when hovered - MOVED INSIDE THE MESSAGE BUBBLE */}
        {showActions && (
          <button
            className="tag-button"
            onClick={() => onTagMessage(message)}
            title="Reply to this message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
          </button>
        )}

        {/* Show delete button for admins when hovered */}
        {showActions && canDeleteMessages && (
          <button
            className="delete-button"
            onClick={handleDeleteMessage}
            title="Delete this message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        )}

        {/* Show reply info if this message is a reply */}
        {message.replyTo && (
          <div className="reply-indicator">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 14 4 9 9 4"></polyline>
              <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
            </svg>
            <span className="reply-text">
              {message.replyTo.sender}:{" "}
              {message.replyTo.text.length > 30
                ? message.replyTo.text.substring(0, 30) + "..."
                : message.replyTo.text}
            </span>
          </div>
        )}

        {/* Code/Output toggle switch for code messages */}
        {message.isCode && (
          <div className="code-toggle-container">
            <div className="code-toggle-switch">
              <button
                className={`code-toggle-option ${!showOutput ? "active" : ""}`}
                onClick={() => setShowOutput(false)}
              >
                Code
              </button>
              <button
                className={`code-toggle-option ${showOutput ? "active" : ""}`}
                onClick={executeCode}
              >
                {executingCode ? "Running..." : "Output"}
              </button>
              <div
                className="code-toggle-slider"
                style={{
                  transform: showOutput ? "translateX(100%)" : "translateX(0)",
                }}
              ></div>
            </div>
          </div>
        )}

        {message.isCode ? (
          <div className="code-container">
            {/* Show either code or interactive output based on toggle state */}
            {!showOutput ? (
              <SyntaxHighlighter
                language={message.language === "nodejs" ? "javascript" : (message.language || "javascript")}
                style={dracula}
                customStyle={{
                  margin: 0,
                  padding: "12px 15px",
                  borderRadius: "var(--border-radius)",
                  fontSize: "0.9rem",
                  backgroundColor: "transparent",
                  overflow: "auto",
                  maxWidth: "100%",
                  width: "100%",
                  wordBreak: "normal",
                  wordWrap: "normal",
                  whiteSpace: "pre",
                }}
                wrapLongLines={false}
              >
                {message.text}
              </SyntaxHighlighter>
            ) : (
              <div className="code-output">
                {executingCode ? (
                  <div className="code-loading">
                    <div className="loading-spinner"></div>
                    <span>Executing code...</span>
                  </div>
                ) : (
                  <>
                    <div className="terminal-output" ref={outputContainerRef}>
                      {outputLines.map((line, index) => (
                        <div
                          key={index}
                          className={`output-line ${line.type}-line`}
                        >
                          {line.text}
                        </div>
                      ))}
                    </div>

                    {messageNeedsStdin(message.text) && !executingCode && (
                      <div className="terminal-input-container" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Standard input:</label>
                        <textarea
                          className="terminal-input"
                          value={codeStdin}
                          onChange={(e) => setCodeStdin(e.target.value)}
                          placeholder="e.g. 5"
                          rows={2}
                          style={{ width: '100%', resize: 'vertical' }}
                        />
                        <button type="button" className="terminal-submit" onClick={() => runCode(codeStdin)}>
                          Run with input
                        </button>
                      </div>
                    )}

                    {awaitingInput && (
                      <form
                        onSubmit={handleInputSubmit}
                        className="terminal-input-container"
                      >
                        <span className="terminal-prompt">$</span>
                        <input
                          type="text"
                          className="terminal-input"
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          ref={terminalInputRef}
                          placeholder="Type your input here..."
                        />
                        <button type="submit" className="terminal-submit">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                          </svg>
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="message-time code-time">{formattedTime}</div>
          </div>
        ) : (
          <>
            <div
              className="message-text"
              style={{
                color: isCurrentUser
                  ? "white"
                  : message.color || "var(--text-color)",
                whiteSpace: "pre-wrap", // This preserves whitespace and line breaks
              }}
            >
              {formatMessageWithMentions(message.text)}
            </div>
            <div className="message-time">{formattedTime}</div>
          </>
        )}

        { /*sohamghosh-jellylemonshake-23bps1146 Code options with language badge first, then copy button */}
        {message.isCode && message.language && (
          <div className="code-options-container">
            <div className="code-language-badge">{message.language}</div>
            <div className="code-action-buttons">
              <button
                className="code-action-button"
                onClick={executeCode}
                title={executingCode ? "Executing..." : "Run code"}
                disabled={executingCode}
              >
                {executingCode ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="spinning"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5,3 19,12 5,21"></polygon>
                  </svg>
                )}
              </button>
              <button
                className="code-action-button"
                onClick={copyCodeToClipboard}
                title="Copy code"
              >
                {copied ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageItem;
