import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import MessageBubble from "../components/MessageBubble";

const API = "https://chatbot-app-3-1.onrender.com";

export default function Chat() {
  const { user, token, logout } = useAuth();
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("groqApiKey") || "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Always read from ref so async functions get latest token
  const headers = (json = false) => {
    const h = { 
      Authorization: `Bearer ${tokenRef.current}`,
      "x-groq-api-key": apiKey
    };
    if (json) h["Content-Type"] = "application/json";
    return h;
  };

  useEffect(() => {
    if (token) fetchSessions();
    else setLoadingSessions(false);
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
  }, [input]);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API}/api/chat/sessions`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load sessions");
      const list = data.sessions || [];
      setSessions(list);
      if (list.length > 0) await loadSession(list[0].id);
      else setLoadingSessions(false);
    } catch (err) {
      setError(err.message);
      setLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId) => {
    if (isStreaming) return;
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    setMessages([]);
    setError("");
    try {
      const res = await fetch(`${API}/api/chat/sessions/${sessionId}`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load session");
      setMessages(data.session?.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMessages(false);
      setLoadingSessions(false);
    }
  };

  const createNewSession = async () => {
    if (isStreaming) return;
    setError("");
    try {
      const res = await fetch(`${API}/api/chat/sessions`, {
        method: "POST",
        headers: headers(true),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");
      setSessions((prev) => [data.session, ...prev]);
      setActiveSessionId(data.session.id);
      setMessages([]);
    } catch (err) {
      setError("Could not create session: " + err.message);
    }
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (isStreaming && sessionId === activeSessionId) return;
    try {
      await fetch(`${API}/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: headers(),
      });
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) loadSession(remaining[0].id);
        else { setActiveSessionId(null); setMessages([]); }
      }
    } catch (err) {
      console.error("deleteSession:", err.message);
    }
  };

  const startRename = (e, session) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  const saveRename = async (sessionId) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await fetch(`${API}/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: headers(true),
        body: JSON.stringify({ title }),
      });
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title } : s));
    } catch (err) {
      console.error("saveRename:", err.message);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!tokenRef.current) {
      setError("Not logged in — please refresh the page");
      return;
    }
    if (!apiKey.trim()) {
      setError("Please enter your Groq API Key in the sidebar before sending a message.");
      return;
    }
    setError("");

    let sessionId = activeSessionId;

    if (!sessionId) {
      try {
        const res = await fetch(`${API}/api/chat/sessions`, {
          method: "POST",
          headers: headers(true),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create session");
        sessionId = data.session.id;
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(sessionId);
      } catch (err) {
        setError("Failed to create session: " + err.message);
        return;
      }
    }

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
      { role: "assistant", content: "", timestamp: new Date().toISOString() },
    ]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch(`${API}/api/chat/sessions/${sessionId}/message`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
                return updated;
              });
            } else if (event.type === "title") {
              setSessions((prev) =>
                prev.map((s) => s.id === sessionId ? { ...s, title: event.title } : s)
              );
            }
          } catch { /* skip malformed */ }
        }
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, preview: text.slice(0, 60), messageCount: (s.messageCount || 0) + 2 }
            : s
        )
      );
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: `⚠️ Error: ${err.message}` };
        return updated;
      });
      setError(err.message);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="chat-layout">
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <div className="brand">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="url(#sg)" />
              <path d="M10 18c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="18" r="2.5" fill="white" />
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="36" y2="36">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span>NexusAI</span>
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="sidebar-new">
          <button className="new-chat-btn" onClick={createNewSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="sessions-list">
          {loadingSessions ? (
            <div className="sessions-loading"><span className="spinner" /></div>
          ) : sessions.length === 0 ? (
            <div className="sessions-empty">No chats yet.<br />Click "New Chat" to start.</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${session.id === activeSessionId ? "active" : ""}`}
                onClick={() => loadSession(session.id)}
              >
                <div className="session-content">
                  {editingId === session.id ? (
                    <input
                      className="rename-input"
                      value={editingTitle}
                      autoFocus
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveRename(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(session.id);
                        if (e.key === "Escape") setEditingId(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="session-title">{session.title}</span>
                      <span className="session-meta">
                        <span className="session-date">{formatDate(session.createdAt)}</span>
                        {session.messageCount > 0 && (
                          <span className="session-count">{session.messageCount} msgs</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="session-actions">
                  <button className="session-btn" onClick={(e) => startRename(e, session)} title="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button className="session-btn delete" onClick={(e) => deleteSession(e, session.id)} title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-settings" style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", display: "block", marginBottom: "8px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Groq API Key</label>
          <input 
            type="password" 
            value={apiKey} 
            onChange={(e) => {
              setApiKey(e.target.value);
              localStorage.setItem("groqApiKey", e.target.value);
            }} 
            placeholder="Enter your gsk_... key" 
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "white", outline: "none", fontSize: "14px", boxSizing: "border-box" }} 
          />
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-dot" />
            <span>{user}</span>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="chat-main">
        {!sidebarOpen && (
          <div className="topbar">
            <button className="sidebar-toggle open" onClick={() => setSidebarOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <span className="topbar-title">
              {sessions.find((s) => s.id === activeSessionId)?.title || "NexusAI"}
            </span>
            <button className="new-chat-icon" onClick={createNewSession}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <div className="error-banner">
            ⚠️ {error}
            <button onClick={() => setError("")}>✕</button>
          </div>
        )}

        <div className="chat-messages">
          {loadingMessages ? (
            <div className="loading-state"><span className="spinner" /></div>
          ) : !activeSessionId || messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="52" height="52" viewBox="0 0 36 36" fill="none">
                  <rect width="36" height="36" rx="10" fill="url(#eg)" />
                  <path d="M10 18c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="18" cy="18" r="2.5" fill="white" />
                  <defs>
                    <linearGradient id="eg" x1="0" y1="0" x2="36" y2="36">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h2>How can I help you today?</h2>
              <p>Type a message below to start the conversation.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NexusAI…"
              rows={1}
              disabled={isStreaming}
            />
            <button
              className={`send-btn ${isStreaming ? "streaming" : ""}`}
              onClick={sendMessage}
              disabled={isStreaming}
            >
              {isStreaming ? (
                <span className="spinner white" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="input-hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </main>
    </div>
  );
}