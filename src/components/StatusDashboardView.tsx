"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { RefreshCw, Send, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, FileText, Trash2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

interface StatusRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_phone: string;
  project: string;
  department: string;
  schedule_label: string;
  scheduled_time: string;
  sent_at: string;
  reply_deadline: string;
  reply_time: string | null;
  status: "pending" | "sent" | "replied" | "not_replied";
  update_text: string;
  report_id?: string;
  created_at: string;
}

interface StatusDashboardProps {
  onViewReport?: (reportId: string) => void;
  onShowToast?: (message: string, type: "success" | "error") => void;
}

const SCHEDULE_LABELS: Record<string, { label: string; emoji: string }> = {
  morning: { label: "9:00 AM", emoji: "🌅" },
  midday: { label: "1:00 PM", emoji: "☀️" },
  evening: { label: "6:00 PM", emoji: "🌆" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getResponseTime(sentAt: string | null, replyTime: string | null): string {
  if (!sentAt || !replyTime) return "--";
  const diffMs = new Date(replyTime).getTime() - new Date(sentAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "<1 min";
  return `${mins} min`;
}

export default function StatusDashboardView({ onViewReport, onShowToast }: StatusDashboardProps) {
  const [requests, setRequests] = useState<StatusRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset).toISOString().split("T")[0];
  });

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/status-requests?date=${selectedDate}`);
      const data = await res.json();
      if (data.requests) {
        setRequests(data.requests);
      }
    } catch (err) {
      console.error("Failed to fetch status requests:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Initial fetch and polling
  useEffect(() => {
    setLoading(true);
    fetchRequests();

    // Poll for timeout checks every 30 seconds
    const interval = setInterval(async () => {
      await fetch("/api/status-requests/check-timeouts").catch(() => {});
      await fetchRequests();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Local Auto-Scheduler
  useEffect(() => {
    const autoScheduleInterval = setInterval(() => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffset);
      const hours = istTime.getUTCHours();
      const minutes = istTime.getUTCMinutes();
      const seconds = istTime.getUTCSeconds();

      // Trigger precisely on the hour for 9 AM, 1 PM, and 6 PM IST
      if ((hours === 9 || hours === 13 || hours === 18) && minutes === 0 && seconds === 0) {
        console.log("[StatusDashboard] Auto-Scheduler triggered!");
        sendNow();
      }
    }, 1000); // Check every second to hit the exact 0th second

    return () => clearInterval(autoScheduleInterval);
  }, []);

  // Supabase Realtime subscription
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[StatusDashboard] Supabase public keys not set, skipping Realtime.");
      return;
    }

    const realtimeClient = createClient(supabaseUrl, supabaseAnonKey);

    const channel = realtimeClient
      .channel("status_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "status_requests",
        },
        (payload) => {
          console.log("[StatusDashboard] Realtime update:", payload.eventType);

          if (payload.eventType === "INSERT") {
            const newRow = payload.new as StatusRequest;
            setRequests((prev) => [newRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as StatusRequest;
            setRequests((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setRequests((prev) => prev.filter((r) => r.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, []);

  // Send status requests manually
  const sendNow = async (schedule?: string) => {
    setSending(true);
    try {
      const param = schedule ? `?schedule=${schedule}&force=true` : "?force=true";
      const res = await fetch(`/api/status-requests/send${param}`);
      const data = await res.json();
      console.log("[StatusDashboard] Send result:", data);
      await fetchRequests();
    } catch (err) {
      console.error("Failed to send status requests:", err);
    } finally {
      setSending(false);
    }
  };

  // Delete status request
  const deleteRequest = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this status update?")) return;
    try {
      const res = await fetch(`/api/status-requests?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
        if (onShowToast) {
          onShowToast("status deleted successfully", "success");
        } else {
          alert("status deleted successfully");
        }
      } else {
        if (onShowToast) {
          onShowToast("Failed to delete status update.", "error");
        } else {
          alert("Failed to delete status update.");
        }
      }
    } catch (err) {
      console.error("Failed to delete status update:", err);
      if (onShowToast) {
        onShowToast("Failed to delete status update.", "error");
      } else {
        alert("Failed to delete status update.");
      }
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const total = requests.length;
    const replied = requests.filter((r) => r.status === "replied").length;
    const waiting = requests.filter((r) => r.status === "sent").length;
    const notReplied = requests.filter((r) => r.status === "not_replied").length;
    return { total, replied, waiting, notReplied };
  }, [requests]);

  // Group by schedule
  const grouped = useMemo(() => {
    const groups: Record<string, StatusRequest[]> = {
      morning: [],
      midday: [],
      evening: [],
    };
    requests.forEach((r) => {
      if (groups[r.schedule_label]) {
        groups[r.schedule_label].push(r);
      }
    });
    return groups;
  }, [requests]);

  if (loading) {
    return (
      <div className="status-dashboard-loading">
        <RefreshCw size={20} className="spin-animation" />
        <span>Loading status dashboard…</span>
      </div>
    );
  }

  return (
    <div className="status-dashboard">
      {/* Header */}
      <div className="status-header">
        <div className="status-header-left">
          <h2 className="status-title">📊 Employee Status Dashboard</h2>
          <p className="status-subtitle">
            Automated project update tracking via WhatsApp 
            <span style={{ marginLeft: "8px", color: "#10b981", fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>
              ● Auto-Scheduler Active
            </span>
          </p>
        </div>
        <div className="status-header-right">
          <button
            className="primary-button status-send-btn"
            onClick={() => sendNow()}
            disabled={sending}
          >
            <Send size={14} />
            {sending ? "Sending…" : "Send Status Request Now"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="status-summary-grid">
        <div className="status-summary-card">
          <span className="status-summary-number">{stats.total}</span>
          <span className="status-summary-label">Total Requests</span>
        </div>
        <div className="status-summary-card replied">
          <span className="status-summary-number">{stats.replied}</span>
          <span className="status-summary-label">✅ Replied</span>
        </div>
        <div className="status-summary-card waiting">
          <span className="status-summary-number">{stats.waiting}</span>
          <span className="status-summary-label">⏳ Waiting</span>
        </div>
        <div className="status-summary-card not-replied">
          <span className="status-summary-number">{stats.notReplied}</span>
          <span className="status-summary-label">❌ Not Replied</span>
        </div>
      </div>

      {/* Tables grouped by schedule */}
      {(["morning", "midday", "evening"] as const).map((schedule) => {
        const items = grouped[schedule];
        if (!items || items.length === 0) return null;

        const info = SCHEDULE_LABELS[schedule];

        return (
          <div className="status-schedule-block" key={schedule}>
            <h3 className="status-schedule-heading">
              {info.emoji} {info.label} — {schedule.charAt(0).toUpperCase() + schedule.slice(1)} Check-in
            </h3>

            <div className="status-table-wrapper">
              <table className="status-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Project</th>
                    <th>Sent At</th>
                    <th>Reply Time</th>
                    <th>Response</th>
                    <th>Status</th>
                    <th>Latest Project Update</th>
                    <th style={{ width: "60px", textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((req) => (
                    <tr key={req.id} className={`status-row status-row-${req.status}`}>
                      <td className="status-cell-name">
                        <div className="status-avatar">
                          {req.employee_name.charAt(0).toUpperCase()}
                        </div>
                        <span>{req.employee_name}</span>
                      </td>
                      <td>{req.department || "--"}</td>
                      <td>{req.project || "--"}</td>
                      <td>{formatTime(req.sent_at)}</td>
                      <td>{formatTime(req.reply_time)}</td>
                      <td>{getResponseTime(req.sent_at, req.reply_time)}</td>
                      <td>
                        <span className={`status-badge-pill ${req.status}`}>
                          {req.status === "replied" && (
                            <><CheckCircle2 size={12} /> Replied</>
                          )}
                          {req.status === "sent" && (
                            <><Clock size={12} /> Waiting</>
                          )}
                          {req.status === "not_replied" && (
                            <><XCircle size={12} /> Not Replied</>
                          )}
                          {req.status === "pending" && (
                            <><AlertCircle size={12} /> Pending</>
                          )}
                        </span>
                      </td>
                      <td className="status-cell-update">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span>{req.update_text || "--"}</span>
                          {req.report_id && onViewReport && (
                            <button
                              onClick={() => onViewReport(req.report_id!)}
                              style={{
                                display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'var(--accent)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                              }}
                            >
                              <FileText size={12} />
                              View Report
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => deleteRequest(req.id)}
                          className="status-delete-btn"
                          title="Delete status update"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {requests.length === 0 && (
        <div className="status-empty">
          <AlertCircle size={40} />
          <h4>No status requests for this date</h4>
          <p>Click "Send Status Request Now" to send project status requests to all active employees via WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
