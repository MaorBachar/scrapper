"use client";

import { useEffect, useRef, useState } from "react";

type SmsMessage = {
  id: string;
  text: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  propertyKey: string;
  propertyKeyHash: string;
  address: string;
  initialAgentName?: string;
  initialAgentPhone?: string;
  onSent: (propertyKeyHash: string, entry: { lifecycle: string; created_at: string }) => void;
  onShowToast: (message: string) => void;
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

export default function SmsModal({
  isOpen,
  onClose,
  propertyKey,
  propertyKeyHash,
  address,
  initialAgentName,
  initialAgentPhone,
  onSent,
  onShowToast,
}: Props) {
  const [agentPhone, setAgentPhone] = useState(initialAgentPhone ?? "");
  const [message, setMessage] = useState(() => {
    const name = (initialAgentName || "").split(" ")[0];
    const addr = address || "";
    return `Hi ${name},\nI am interested in purchasing the property at ${addr}.\nDo you think there is room to negotiate within the range of 85-90k?\n\nThanks,\nMaor`;
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversation, setConversation] = useState<SmsMessage[]>([]);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const convoEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !initialAgentPhone) {
      setConversation([]);
      return;
    }
    setLoadingConvo(true);
    fetch(`/api/sms/messages?phone=${encodeURIComponent(initialAgentPhone)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SmsMessage[]) => setConversation(data ?? []))
      .catch(() => setConversation([]))
      .finally(() => setLoadingConvo(false));
  }, [isOpen, initialAgentPhone]);

  useEffect(() => {
    if (conversation.length > 0) {
      convoEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const smsRes = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: agentPhone.replace(/\D/g, ""),
          content: message.trim(),
        }),
      });
      if (!smsRes.ok) {
        const data = await smsRes.json();
        throw new Error(data.error || "Failed to send SMS");
      }

      setConversation((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          text: message.trim(),
          direction: "outgoing",
          createdAt: new Date().toISOString(),
        },
      ]);

      const description = `To: ${agentPhone}. Message: ${message.trim()}`;
      const lifecycleRes = await fetch("/api/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_key: propertyKey,
          lifecycle: "Sent SMS",
          description,
        }),
      });
      if (!lifecycleRes.ok) {
        const data = await lifecycleRes.json();
        throw new Error(data.error || "Failed to update lifecycle");
      }
      const newEntry = await lifecycleRes.json();
      onSent(propertyKeyHash, {
        lifecycle: "Sent SMS",
        created_at: newEntry.created_at || new Date().toISOString(),
      });
      onShowToast("SMS sent successfully");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="modal-panel" role="dialog" aria-labelledby="sms-modal-title">
        <div className="modal-header">
          <h2 id="sms-modal-title">Send SMS</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <p className="modal-address">
          {address}
          {initialAgentName && (
            <span style={{ display: "block", marginTop: 4, fontSize: 13, opacity: 0.7 }}>
              Agent: {initialAgentName}
            </span>
          )}
        </p>

        <div className="sms-conversation">
          <div className="sms-conversation-title">Conversation</div>
          {loadingConvo ? (
            <p className="text-muted text-sm" style={{ padding: "12px 0" }}>Loading messages...</p>
          ) : conversation.length === 0 ? (
            <p className="text-muted text-sm" style={{ padding: "12px 0" }}>No previous messages</p>
          ) : (
            <div className="sms-conversation-scroll">
              {conversation.map((m) => (
                <div
                  key={m.id}
                  className={`sms-bubble ${m.direction === "outgoing" ? "sms-bubble-out" : "sms-bubble-in"}`}
                >
                  <div className="sms-bubble-text">{m.text}</div>
                  <div className="sms-bubble-time">{fmtTime(m.createdAt)}</div>
                </div>
              ))}
              <div ref={convoEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="sms-agent-phone">Agent phone</label>
            <input
              id="sms-agent-phone"
              type="tel"
              className="form-input"
              placeholder="e.g. 5551234567"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              required
              disabled={sending}
            />
          </div>
          <div className="form-group">
            <label htmlFor="sms-message">Message</label>
            <textarea
              id="sms-message"
              className="form-input"
              placeholder="Your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              disabled={sending}
              style={{ resize: "vertical", minHeight: 100 }}
            />
          </div>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
