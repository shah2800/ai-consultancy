import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/api";
import { roleFromToken, emailFromToken } from "../utils/jwt";
import { setupManagedPolling } from "../utils/performance";

function currentRoleFromToken() {
  return roleFromToken(localStorage.getItem("token"));
}

const NAV_LINKS = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    to: "/leads",
    label: "Leads",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    to: "/analytics",
    label: "AI Analytics",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    to: "/notifications",
    label: "Notifications",
    badgeKey: "notifications",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    to: "/broadcast",
    label: "Broadcast",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2L11 13"/>
        <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
      </svg>
    ),
  },
  {
    to: "/universities",
    label: "Universities",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 22h20"/>
        <path d="M4 22V10"/>
        <path d="M20 22V10"/>
        <path d="M12 22V14"/>
        <path d="M2 10l10-6 10 6"/>
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

export default function Navbar({ onNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationCount, setNotificationCount] = useState(0);
  const role = currentRoleFromToken();
  /* Admin/manager: Team before Settings */
  const teamLink = {
    to: "/team",
    label: "Team",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  };

  const links =
    role === "admin" || role === "manager"
      ? [...NAV_LINKS.slice(0, 6), teamLink, NAV_LINKS[6]]
      : NAV_LINKS;

  const userEmail = emailFromToken(localStorage.getItem("token"));

  // Keep badge fresh while active, and refresh on explicit notification updates.
  useEffect(() => {
    const fetchBadge = async () => {
      try {
        const notifRes = await api.get("/admin/notifications");
        const unread = (notifRes.data || [])
          .filter((n) => !n.read)
          .reduce((sum, n) => sum + (n.count || 1), 0);
        setNotificationCount(unread);
      } catch {
        /* ignore badge fetch errors */
      }
    };

    const polling = setupManagedPolling(
      fetchBadge,
      { baseMs: 30000, minGapMs: 3500, runImmediately: true }
    );
    const onNotificationsUpdated = () => {
      polling.trigger({ force: true });
    };

    window.addEventListener("crm-notifications-updated", onNotificationsUpdated);
    return () => {
      polling.dispose();
      window.removeEventListener("crm-notifications-updated", onNotificationsUpdated);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div
      className="crm-sidebar-inner"
      style={{
        width: 236,
        minWidth: 236,
        background: "linear-gradient(180deg, var(--sidebar-bg-deep) 0%, var(--sidebar-bg) 28%)",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--sidebar-border)",
        position: "sticky",
        top: 0,
        flex: 1,
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
        overflow: "hidden",
      }}
    >
      {/* Brand + profile — does not shrink */}
      <div style={{
        flexShrink: 0,
        padding: "20px 18px 16px",
        borderBottom: "1px solid var(--sidebar-border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "var(--font-heading)" }}>
              NextStep
            </div>
            <div style={{ color: "var(--sidebar-text)", fontSize: 10, marginTop: 1 }}>
              CRM Dashboard
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--sidebar-label)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            Profile
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--sidebar-text)",
              wordBreak: "break-word",
              lineHeight: 1.45,
              fontFamily: "var(--font-body)",
            }}
            title={userEmail || undefined}
          >
            {userEmail || "—"}
          </div>
        </div>
      </div>

      {/* Nav section label */}
      <div style={{
        flexShrink: 0,
        padding: "4px 16px 8px",
        fontSize: 10,
        fontWeight: 700,
        color: "var(--sidebar-label)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        Main Menu
      </div>

      {/* Links — scrolls; keeps logout at bottom */}
      <nav
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          padding: "0 10px 8px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {links.map((link) => {
          /* Only highlight “Leads” on the list route — not on `/leads/:id` (lead profile). */
          const active =
            link.to === "/leads"
              ? location.pathname === "/leads"
              : location.pathname === link.to ||
                (link.to !== "/dashboard" && location.pathname.startsWith(link.to));
          const notifBadge = link.badgeKey === "notifications" ? notificationCount : 0;
          const showBadge = notifBadge > 0;

          const badgeHint =
            link.badgeKey === "notifications" && showBadge
              ? `${notifBadge} unread notifications`
              : undefined;

          return (
            <a
              key={link.to}
              href={link.to}
              title={badgeHint}
              onClick={(e) => {
                /* Explicit SPA navigation — avoids rare cases where <Link> doesn’t swap the route until full reload (esp. long pages like Assigned leads). */
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                navigate(link.to);
                onNavigate?.();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                marginBottom: 3,
                textDecoration: "none",
                color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                background: active ? "var(--sidebar-active-bg)" : "transparent",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                transition: "all 0.15s ease",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                position: "relative",
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6, color: active ? "var(--accent)" : "inherit" }}>
                {link.icon}
              </span>
              <span style={{ flex: 1 }}>{link.label}</span>

              {/* Notification badge */}
              {showBadge && (
                <span
                  aria-label={badgeHint || `${notifBadge}`}
                  style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 9,
                  background: "var(--danger)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {notifBadge > 99 ? "99+" : notifBadge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Logout — pinned to bottom of sidebar */}
      <div style={{
        flexShrink: 0,
        padding: "12px 10px 18px",
        borderTop: "1px solid var(--sidebar-border)",
      }}>
        <button
          type="button"
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "9px 10px",
            borderRadius: 8,
            background: "transparent",
            border: "none",
            color: "var(--sidebar-text)",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,80,80,0.1)";
            e.currentTarget.style.color = "#FF6B6B";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--sidebar-text)";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Logout
        </button>
      </div>

      <style>{`
        .crm-sidebar-inner {
          box-sizing: border-box;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
