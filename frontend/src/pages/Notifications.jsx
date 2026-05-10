import { useCallback, useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import { useProgressiveRevealOneTier } from "../hooks/useProgressiveReveal";
import SkeletonPulse from "../components/SkeletonPulse";
import { getAdaptivePollInterval } from "../utils/performance";

function NotificationsPageSkeleton() {
  return (
    <div className="page-shell" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <SkeletonPulse style={{ width: 220, height: 22, marginBottom: 10, borderRadius: 6 }} />
          <SkeletonPulse style={{ width: 280, height: 13, borderRadius: 4 }} />
        </div>
        <SkeletonPulse style={{ width: 160, height: 40, borderRadius: 10 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <SkeletonPulse style={{ width: 140, height: 36, borderRadius: 8 }} />
        <SkeletonPulse style={{ width: 180, height: 36, borderRadius: 8 }} />
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ padding: "14px 16px", borderBottom: i === 4 ? "none" : "1px solid var(--border)" }}>
            <SkeletonPulse style={{ width: "72%", height: 14, marginBottom: 8 }} />
            <SkeletonPulse style={{ width: 200, height: 11 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationListSkeleton({ rows }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderBottom: i === rows - 1 ? "none" : "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, flex: 1 }}>
            <SkeletonPulse style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <SkeletonPulse style={{ width: "75%", height: 14, marginBottom: 8 }} />
              <SkeletonPulse style={{ width: 160, height: 11 }} />
            </div>
          </div>
          <SkeletonPulse style={{ width: 72, height: 30, borderRadius: 8 }} />
        </div>
      ))}
    </>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [groupedItems, setGroupedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const buildGroupedItems = (notifications) => {
    const grouped = [];
    const map = new Map();

    for (const n of notifications) {
      const key = n.type === "new_message" && n.leadId
        ? `new_message:${n.leadId}`
        : `single:${n._id}`;

      if (!map.has(key)) {
        const unreadCount = !n.read ? (n.count || 1) : 0;
        map.set(key, {
          _id: n._id,
          ids: [n._id],
          type: n.type,
          leadId: n.leadId || null,
          message: n.message,
          read: !!n.read,
          createdAt: n.createdAt,
          count: unreadCount,
        });
      } else {
        const g = map.get(key);
        g.ids.push(n._id);
        // Count only unread messages so opening a thread resets badge to 0.
        if (!n.read) g.count += n.count || 1;
        // Keep unread if any item in the group is unread.
        g.read = g.read && !!n.read;
        if (new Date(n.createdAt) > new Date(g.createdAt)) {
          g.createdAt = n.createdAt;
          g.message = n.message;
          g._id = n._id;
        }
      }
    }

    for (const g of map.values()) {
      const msgBase = String(g.message || "");
      /** Strip legacy "(2)" suffix from title — count lives only on the red badge */
      const finalMessage = msgBase.replace(/\(\d+\)\s*$/, "").trim();

      grouped.push({
        ...g,
        message: finalMessage,
      });
    }

    grouped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return grouped;
  };

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/admin/notifications");
      const data = res.data || [];
      setItems(data);
      setGroupedItems(buildGroupedItems(data));
      if (!silent) setSelectedIds([]);
    } catch {
      setItems([]);
      setGroupedItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const pollMs = getAdaptivePollInterval(10000);

    let interval = null;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      load({ silent: true });
    };
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(refresh, pollMs);
    };
    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };
    const onNotificationsUpdated = () => {
      refresh();
    };

    onVisibilityChange();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("crm-notifications-updated", onNotificationsUpdated);

    return () => {
      stopPolling();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("crm-notifications-updated", onNotificationsUpdated);
    };
  }, [load]);

  const markOne = async (id) => {
    try {
      const group = groupedItems.find((g) => g._id === id);
      const ids = group?.ids?.length ? group.ids : [id];
      await Promise.all(ids.map((nid) => api.patch(`/admin/notifications/${nid}/read`)));
      setItems((prev) => {
        const updated = prev.map((n) => (ids.includes(n._id) ? { ...n, read: true } : n));
        setGroupedItems(buildGroupedItems(updated));
        return updated;
      });
    } catch {
      /* ignore mark read errors */
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.post("/admin/notifications/read-all");
      setItems((prev) => {
        const updated = prev.map((n) => ({ ...n, read: true }));
        setGroupedItems(buildGroupedItems(updated));
        return updated;
      });
    } catch {
      /* ignore mark-all errors */
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = groupedItems.filter((n) => !n.read).length;
  const unreadMessagesCount = groupedItems
    .filter((n) => !n.read)
    .reduce((sum, n) => sum + (n.count || 1), 0);

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    setDeleting(true);
    try {
      const idsToDelete = groupedItems
        .filter((g) => selectedIds.includes(g._id))
        .flatMap((g) => g.ids?.length ? g.ids : [g._id]);

      await api.post("/admin/notifications/delete-selected", { ids: idsToDelete });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete selected notifications.");
    } finally {
      setDeleting(false);
    }
  };

  const listPaintReady = useProgressiveRevealOneTier(!loading, "notifications-list");

  const clearAll = async () => {
    setDeleting(true);
    try {
      await api.post("/admin/notifications/clear-all");
      setItems([]);
      setGroupedItems([]);
      setSelectedIds([]);
    } catch (err) {
      // Fallback for older backend instances that don't expose clear-all reliably.
      try {
        const allIds = groupedItems.flatMap((g) => g.ids?.length ? g.ids : [g._id]);
        if (allIds.length) {
          await api.post("/admin/notifications/delete-selected", { ids: allIds });
        } else {
          // Last fallback: delete by single id endpoint.
          await Promise.all(
            groupedItems.map((g) => api.delete(`/admin/notifications/${g._id}`))
          );
        }
        setItems([]);
        setGroupedItems([]);
        setSelectedIds([]);
      } catch (fallbackErr) {
        alert(
          fallbackErr.response?.data?.error ||
            err.response?.data?.error ||
            "Failed to clear notifications."
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <NotificationsPageSkeleton />;
  }

  return (
    <div className="page-shell" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {unreadCount} unread threads · {unreadMessagesCount} unread messages
          </p>
        </div>
        <button
          onClick={markAll}
          disabled={markingAll || unreadCount === 0}
          className={`btn ${unreadCount ? "btn-primary" : "btn-secondary"}`}
        >
          {markingAll ? "Marking..." : "Mark all as read"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={deleteSelected}
          disabled={deleting || selectedIds.length === 0}
          className="btn btn-secondary"
        >
          {deleting ? "Deleting..." : `Delete selected (${selectedIds.length})`}
        </button>
        <button
          onClick={clearAll}
          disabled={deleting || groupedItems.length === 0}
          className="btn btn-secondary"
        >
          Clear all notifications
        </button>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {groupedItems.length === 0 ? (
          <div className="panel-body" style={{ color: "var(--text-3)" }}>No notifications yet.</div>
        ) : !listPaintReady ? (
          <NotificationListSkeleton rows={Math.min(8, groupedItems.length)} />
        ) : (
          groupedItems.map((n, idx) => (
            <div
              key={n._id}
              style={{
                padding: "12px 14px",
                borderBottom: idx === groupedItems.length - 1 ? "none" : "1px solid var(--border)",
                background: n.read ? "var(--surface)" : "var(--accent-light)",
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ paddingTop: 2 }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(n._id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(n._id)}
                    style={{ marginTop: 3, cursor: "pointer" }}
                  />
                </div>
                <div
                  style={{ cursor: n.leadId ? "pointer" : "default", flex: 1 }}
                  onClick={async () => {
                    if (!n.leadId) return;
                    try {
                      const lid = String(n.leadId);
                      await api.post(`/admin/notifications/read-for-lead/${lid}`);
                      window.dispatchEvent(new CustomEvent("crm-notifications-updated"));
                      const updated = items.map((row) =>
                        row.leadId && String(row.leadId) === lid ? { ...row, read: true } : row
                      );
                      setItems(updated);
                      setGroupedItems(buildGroupedItems(updated));
                    } catch {
                      /* still navigate even if read ack fails */
                    }
                    navigate(`/leads/${n.leadId}`);
                  }}
                >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{n.message}</span>
                  {!n.read && n.type === "new_message" && (
                    <span
                      title={`${n.count || 1} unread message${(n.count || 1) === 1 ? "" : "s"}`}
                      style={{
                        background: "var(--danger)",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        minWidth: 22,
                        height: 22,
                        padding: "0 7px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {n.count || 1}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                  {n.type} · {new Date(n.createdAt).toLocaleString()}
                </div>
                </div>
              </div>
              {!n.read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markOne(n._id);
                  }}
                  className="btn btn-secondary"
                  style={{ alignSelf: "center", padding: "5px 9px", fontSize: 12 }}
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
