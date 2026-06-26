"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { MessageCircle, User, Bot, Clock, RefreshCw, Search, Send } from "lucide-react";

export type WhatsAppMessage = {
  id: string;
  from: string;
  employeeName: string;
  text: string;
  timestamp: string;
  type: 'inbound' | 'outbound';
};

export default function WhatsAppChatView() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeThreadFrom, setActiveThreadFrom] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch messages from database
  const fetchMessages = async (showRefreshIndicator = true) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      }
      const res = await fetch('/api/whatsapp/messages');
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      
      // Sort messages by timestamp descending (newest first for standard flex-col-reverse)
      const sorted = (data as WhatsAppMessage[]).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setMessages(sorted);
    } catch (err) {
      console.error("Error fetching WhatsApp messages:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => fetchMessages(false), 5000); // Poll silently every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Group messages into conversation threads
  const threads = useMemo(() => {
    const threadMap = new Map<string, {
      from: string;
      employeeName: string;
      lastMessage: WhatsAppMessage;
      allMessages: WhatsAppMessage[];
    }>();

    // Loop through messages (oldest to newest) to group them
    const reversedMessages = [...messages].reverse();
    reversedMessages.forEach((msg) => {
      const phone = msg.from.replace(/\D/g, '');
      const existing = threadMap.get(phone);
      
      if (existing) {
        existing.lastMessage = msg;
        existing.allMessages.push(msg);
      } else {
        threadMap.set(phone, {
          from: phone,
          employeeName: msg.employeeName || 'Unknown User',
          lastMessage: msg,
          allMessages: [msg]
        });
      }
    });

    return Array.from(threadMap.values()).sort((a, b) => 
      new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime()
    );
  }, [messages]);

  // Set initial active thread if none selected
  useEffect(() => {
    if (threads.length > 0 && !activeThreadFrom) {
      setActiveThreadFrom(threads[0].from);
    }
  }, [threads, activeThreadFrom]);

  // Filter threads by search term
  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter(t => 
      t.employeeName.toLowerCase().includes(query) || 
      t.from.includes(query) || 
      t.lastMessage.text.toLowerCase().includes(query)
    );
  }, [threads, searchTerm]);

  // Selected thread details
  const activeThread = useMemo(() => {
    if (!activeThreadFrom) return null;
    return threads.find(t => t.from === activeThreadFrom) || null;
  }, [threads, activeThreadFrom]);

  // Messages of the active thread (newest first for flex-col-reverse scroll)
  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    return [...activeThread.allMessages].reverse();
  }, [activeThread]);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadFrom || !newMessage.trim() || sending) return;

    try {
      setSending(true);
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeThreadFrom,
          body: newMessage
        })
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      setNewMessage("");
      // Fetch messages immediately to update the list
      await fetchMessages(false);
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Failed to send WhatsApp message. Please check API configuration.");
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2) || '?';
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ height: 'calc(100vh - 200px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <strong>Loading conversation history...</strong>
        <span className="animate-pulse" style={{ color: 'var(--green)', marginTop: '8px' }}>connecting to live database</span>
      </div>
    );
  }

  return (
    <div className="whatsapp-layout">
      {/* Sidebar - Threads List */}
      <aside className="whatsapp-sidebar" aria-label="WhatsApp Chats">
        <div className="w-sidebar-header">
          <h3>Chats</h3>
          <div className="w-search-container">
            <Search size={14} />
            <input
              className="w-search-input"
              placeholder="Search chats..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="w-threads-list">
          {filteredThreads.length === 0 ? (
            <div className="w-empty-chat" style={{ padding: '24px 16px' }}>
              <p style={{ fontSize: '0.8rem' }}>No conversations found</p>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isActive = thread.from === activeThreadFrom;
              return (
                <button
                  className={`w-thread-item ${isActive ? 'active' : ''}`}
                  key={thread.from}
                  onClick={() => setActiveThreadFrom(thread.from)}
                  type="button"
                >
                  <div className="w-thread-avatar">
                    {getInitials(thread.employeeName)}
                  </div>
                  <div className="w-thread-info">
                    <div className="w-thread-meta">
                      <span className="w-thread-name">{thread.employeeName}</span>
                      <span className="w-thread-time">{formatTime(thread.lastMessage.timestamp)}</span>
                    </div>
                    <p className="w-thread-snippet">
                      {thread.lastMessage.type === 'outbound' ? 'You: ' : ''}
                      {thread.lastMessage.text}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <section className="whatsapp-chat-area" aria-label="Conversation Thread">
        {activeThread ? (
          <>
            {/* Header */}
            <div className="w-chat-header">
              <div className="w-chat-header-user">
                <div className="w-chat-header-avatar">
                  {getInitials(activeThread.employeeName)}
                </div>
                <div className="w-chat-header-meta">
                  <h4>{activeThread.employeeName}</h4>
                  <span>+{activeThread.from}</span>
                </div>
              </div>
              <div className="w-chat-actions">
                <button 
                  className="w-refresh-btn" 
                  onClick={() => fetchMessages(true)}
                  disabled={refreshing}
                  title="Refresh chat history"
                  type="button"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Messages Bubbles list (displays reverse column direction) */}
            <div className="w-messages-container">
              <div ref={messagesEndRef} />
              {activeMessages.map((msg) => {
                const isInbound = msg.type === 'inbound';
                return (
                  <div className={`w-message-row ${isInbound ? 'inbound' : 'outbound'}`} key={msg.id}>
                    <div className={`w-message-bubble ${isInbound ? 'inbound' : 'outbound'}`}>
                      <div className="w-message-sender">
                        {isInbound ? (
                          <>
                            <User size={10} />
                            <span>{msg.employeeName}</span>
                          </>
                        ) : (
                          <>
                            <Bot size={10} />
                            <span>EnxtBrain AI (Admin)</span>
                          </>
                        )}
                      </div>
                      <p className="w-message-text">{msg.text}</p>
                      <div className="w-message-time">
                        <Clock size={8} />
                        <span>{formatTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Send Area */}
            <div className="w-input-area">
              <form className="w-input-form" onSubmit={handleSendMessage}>
                <input
                  className="w-input-field"
                  placeholder={`Send WhatsApp message to ${activeThread.employeeName}...`}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sending}
                  required
                />
                <button 
                  className="w-send-btn" 
                  type="submit" 
                  disabled={sending || !newMessage.trim()}
                  title="Send WhatsApp message"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="w-empty-chat">
            <MessageCircle size={48} style={{ color: 'var(--green-soft)' }} />
            <h4>Your WhatsApp Workspace</h4>
            <p>Select a chat from the sidebar to view full message logs and respond in real-time.</p>
          </div>
        )}
      </section>
    </div>
  );
}
