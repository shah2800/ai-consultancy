import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/api";
import { useProgressiveRevealTwoTier } from "../hooks/useProgressiveReveal";
import PasswordField from "../components/PasswordField";
import { parseJwtPayload } from "../utils/jwt";

const baseInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  boxSizing: "border-box",
};

export default function Team() {
  const location = useLocation();
  const payload = parseJwtPayload(localStorage.getItem("token"));
  const role = String(payload?.role || "");
  const isAdmin = role === "admin";
  const canAccessTeam = role === "admin" || role === "manager";
  const selfId = String(payload?.id || "");

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [signupSaving, setSignupSaving] = useState(false);
  const [allowPublicRegister, setAllowPublicRegister] = useState(null);
  const [signupSource, setSignupSource] = useState("");
  const [canManagePublicSignup, setCanManagePublicSignup] = useState(null);
  const [rowBusy, setRowBusy] = useState("");
  const [canCreateOwnerInvites, setCanCreateOwnerInvites] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberInviteUrl, setMemberInviteUrl] = useState("");
  const [ownerInviteUrl, setOwnerInviteUrl] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "staff",
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/team");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load team.");
    } finally {
      setLoading(false);
    }
  };

  const loadAppConfig = async () => {
    try {
      const cfgRes = await api.get("/admin/app-config");
      setAllowPublicRegister(!!cfgRes.data?.allowPublicRegister);
      setSignupSource(String(cfgRes.data?.source || ""));
      setCanManagePublicSignup(cfgRes.data?.canManagePublicSignup === true);
    } catch {
      setAllowPublicRegister(null);
      setCanManagePublicSignup(false);
    }
    try {
      const plat = await api.get("/platform/signup-invite-eligibility");
      setCanCreateOwnerInvites(!!plat.data?.canCreateOwnerInvites);
    } catch {
      setCanCreateOwnerInvites(false);
    }
  };

  useEffect(() => {
    if (!canAccessTeam) {
      setLoading(false);
      return;
    }
    loadUsers();
    loadAppConfig();
  }, [canAccessTeam, location.pathname]);

  const { primaryReady, secondaryReady } = useProgressiveRevealTwoTier(
    canAccessTeam,
    location.pathname
  );

  const setSignup = async (next) => {
    setError("");
    setOk("");
    setSignupSaving(true);
    try {
      await api.patch("/admin/app-config", { allowPublicRegister: next });
      setAllowPublicRegister(next);
      setOk(
        next
          ? "Public signup is now open. The login page will show “Create account”."
          : "Public signup is closed. Only admins can add people from this page."
      );
      setSignupSource("database");
    } catch (err) {
      setError(err.response?.data?.error || "Could not update signup setting.");
    } finally {
      setSignupSaving(false);
    }
  };

  const patchMember = async (id, body) => {
    setError("");
    setOk("");
    setRowBusy(id);
    try {
      const res = await api.patch(`/admin/team/${id}`, body);
      const updated = res.data;
      setUsers((prev) =>
        prev.map((u) => (String(u._id) === String(id) ? { ...u, ...updated } : u))
      );
      setOk("Team member updated.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not update user.");
    } finally {
      setRowBusy("");
    }
  };

  const createMemberInvite = async () => {
    setError("");
    setOk("");
    setInviteBusy(true);
    try {
      const body = { role: inviteRole };
      const em = inviteEmail.trim();
      if (em) body.email = em;
      const res = await api.post("/admin/workspace-invites", body);
      setMemberInviteUrl(res.data?.inviteUrl || "");
      setOk("Workspace invite link ready — copy and send it (expires in 48 hours).");
    } catch (err) {
      setError(err.response?.data?.error || "Could not create invite.");
    } finally {
      setInviteBusy(false);
    }
  };

  const createOwnerInvite = async () => {
    setError("");
    setOk("");
    setInviteBusy(true);
    try {
      const em = inviteEmail.trim();
      const res = await api.post("/platform/owner-signup-invites", em ? { email: em } : {});
      setOwnerInviteUrl(res.data?.inviteUrl || "");
      setOk("New-consultancy signup link created — send it to your customer (expires in 48 hours).");
    } catch (err) {
      setError(err.response?.data?.error || "Could not create owner invite.");
    } finally {
      setInviteBusy(false);
    }
  };

  const createUser = async () => {
    setError("");
    setOk("");
    if (!form.name || !form.email || !form.password) {
      setError("Name, email and password are required.");
      return;
    }

    setCreating(true);
    try {
      await api.post("/admin/team", form);
      setOk("Team member created.");
      setForm({ name: "", email: "", password: "", role: "staff" });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create user.");
    } finally {
      setCreating(false);
    }
  };

  const removeMember = async (id) => {
    setError("");
    setOk("");
    if (
      !window.confirm(
        "Permanently delete this account? Their leads and settings for this workspace will be removed."
      )
    ) {
      return;
    }
    setRowBusy(id);
    try {
      await api.delete(`/admin/team/${id}`);
      setOk("Team member removed.");
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not remove user.");
    } finally {
      setRowBusy("");
    }
  };

  if (!canAccessTeam) {
    return (
      <div className="page-shell" style={{ maxWidth: 760 }}>
        <div className="analytics-error">Only admins and managers can access Team Management.</div>
      </div>
    );
  }

  return (
    <div className="page-shell team-page" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 4px",
            fontFamily: "var(--font-heading)",
          }}
        >
          Team Management
        </h1>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
          Invite accounts and suspend access. Global public signup is controlled by{" "}
          <strong>admins only</strong> (not managers).
        </p>
      </div>

      {error ? (
        <div className="analytics-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}
      {ok ? (
        <div
          style={{
            background: "var(--ready-bg)",
            border: "1px solid rgb(134 239 172)",
            color: "var(--ready)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {ok}
        </div>
      ) : null}

      {primaryReady && canManagePublicSignup === true && isAdmin ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 8,
              color: "var(--text)",
              fontFamily: "var(--font-heading)",
            }}
          >
            Public sign-up
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
            <strong>App-wide</strong>—same signup/login for everyone. Other workspaces are unchanged.{" "}
            <code style={{ fontSize: 12 }}>PERMANENT_MANAGER_EMAILS</code> accounts stay managers on the server and
            can&apos;t be demoted here.
          </p>
          {allowPublicRegister === null ? (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading setting…</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button
                type="button"
                className={allowPublicRegister ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setSignup(true)}
                disabled={signupSaving || allowPublicRegister === true}
              >
                {signupSaving && allowPublicRegister === false ? "Saving…" : "Allow public signup"}
              </button>
              <button
                type="button"
                className={!allowPublicRegister ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setSignup(false)}
                disabled={signupSaving || allowPublicRegister === false}
              >
                {signupSaving && allowPublicRegister === true ? "Saving…" : "Disable public signup"}
              </button>
              <span className="chip" style={{ border: "1px solid var(--border)", fontSize: 12 }}>
                {allowPublicRegister ? "Open" : "Closed"}
                {signupSource ? ` · ${signupSource}` : ""}
              </span>
            </div>
          )}
        </div>
      ) : null}

      {primaryReady ? (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "20px 22px",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--text)",
            fontFamily: "var(--font-heading)",
          }}
        >
          Invite with link (48 hours)
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
          Better than open registration: send this URL so people create their own password. Leave email empty unless you want to lock the invite to one address.
        </p>
        <div className="team-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
          <input
            style={baseInputStyle}
            type="email"
            placeholder="Optional — lock to one email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            style={baseInputStyle}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={createMemberInvite} disabled={inviteBusy}>
            {inviteBusy ? "…" : "Generate workspace invite"}
          </button>
          {canCreateOwnerInvites ? (
            <button type="button" className="btn btn-primary" onClick={createOwnerInvite} disabled={inviteBusy}>
              {inviteBusy ? "…" : "New consultancy invite (platform)"}
            </button>
          ) : null}
        </div>
        {memberInviteUrl ? (
          <div style={{ marginBottom: canCreateOwnerInvites ? 14 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>Workspace invite URL</div>
            <input readOnly style={{ ...baseInputStyle, fontSize: 12 }} value={memberInviteUrl} onFocus={(e) => e.target.select()} />
          </div>
        ) : null}
        {ownerInviteUrl ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>New consultancy invite URL</div>
            <input readOnly style={{ ...baseInputStyle, fontSize: 12 }} value={ownerInviteUrl} onFocus={(e) => e.target.select()} />
          </div>
        ) : null}
      </div>
      ) : null}

      {primaryReady ? (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "20px 22px",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 14,
            color: "var(--text)",
            fontFamily: "var(--font-heading)",
          }}
        >
          Add team member
        </div>
        <div className="team-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <input
            style={baseInputStyle}
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            style={baseInputStyle}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          <PasswordField
            id="team-create-password"
            style={baseInputStyle}
            placeholder="Password (min 6)"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            autoComplete="new-password"
          />
          <select
            style={baseInputStyle}
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={createUser}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create user"}
          </button>
        </div>
      </div>
      ) : (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 18,
          }}
        >
          <div className="dashboard-skeleton-pulse" style={{ width: 160, height: 18, marginBottom: 14 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 120, borderRadius: 10 }} aria-hidden />
        </div>
      )}

      {secondaryReady ? (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "20px 22px",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 14,
            color: "var(--text)",
            fontFamily: "var(--font-heading)",
          }}
        >
          Team
        </div>
        {loading ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading team…</div>
        ) : users.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>No users found.</div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {users.map((u) => {
              const isSelf = selfId && String(u._id) === selfId;
              const active = u.isActive !== false;
              const busy = rowBusy === String(u._id);
              return (
                <div
                  className="team-row"
                  key={u._id}
                  style={{
                    border: isSelf ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    display: "grid",
                    gridTemplateColumns: "minmax(120px,1fr) minmax(160px,1.2fr) auto auto auto",
                    gap: 10,
                    alignItems: "center",
                    background: isSelf ? "rgb(var(--accent-rgb) / 0.06)" : "var(--surface)",
                    opacity: active ? 1 : 0.72,
                    minWidth: 0,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
                      {u.name || "—"}
                      {isSelf ? (
                        <span
                          className="chip"
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            verticalAlign: "middle",
                            border: "1px solid var(--accent)",
                            color: "var(--accent)",
                          }}
                        >
                          You
                        </span>
                      ) : null}
                      {u.isPermanentManager ? (
                        <span
                          className="chip"
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            verticalAlign: "middle",
                            border: "1px solid var(--border)",
                            color: "var(--text-3)",
                          }}
                          title="Listed in server PERMANENT_MANAGER_EMAILS"
                        >
                          Protected
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>
                      {u.jobTitle ? (
                        <span style={{ display: "block", marginBottom: 2 }}>{u.jobTitle}</span>
                      ) : null}
                      {active ? "Active" : "Suspended"}
                    </div>
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: 13, wordBreak: "break-all" }}>
                    {u.email || "—"}
                  </div>
                  <select
                    style={{
                      ...baseInputStyle,
                      padding: "8px 10px",
                      minWidth: 110,
                    }}
                    value={u.role}
                    disabled={busy || isSelf || u.isPermanentManager}
                    title={
                      isSelf
                        ? "Ask another admin to change your role."
                        : u.isPermanentManager
                          ? "Protected permanent manager (PERMANENT_MANAGER_EMAILS)."
                          : ""
                    }
                    onChange={(e) => patchMember(u._id, { role: e.target.value })}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    className={active ? "btn btn-secondary" : "btn btn-primary"}
                    style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 12px" }}
                    disabled={busy || isSelf || u.isPermanentManager}
                    title={
                      isSelf
                        ? "You cannot suspend your own account here."
                        : u.isPermanentManager
                          ? "Permanent managers cannot be suspended from here."
                          : ""
                    }
                    onClick={() => patchMember(u._id, { isActive: !active })}
                  >
                    {busy ? "…" : active ? "Suspend" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      padding: "8px 12px",
                      color: "var(--danger)",
                      borderColor: "rgb(178 59 59 / 0.35)",
                    }}
                    disabled={busy || isSelf || u.isPermanentManager}
                    title={
                      isSelf
                        ? "You cannot delete your own account here."
                        : u.isPermanentManager
                          ? "Accounts in PERMANENT_MANAGER_EMAILS cannot be deleted."
                          : "Permanently delete this user"
                    }
                    onClick={() => removeMember(u._id)}
                  >
                    {busy ? "…" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      ) : primaryReady ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div className="dashboard-skeleton-pulse" style={{ width: 80, height: 16, marginBottom: 14 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 160, borderRadius: 10 }} aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
