"use client";

import { useCallback, useEffect, useState } from "react";
import "./forms.css";
import "./team.css";
import { useLang } from "@/lib/i18n";
import { ROLE_LABEL, atLeast, type Role } from "@/lib/roles";

type Member = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
};

type Secret = { name: string; phone: string; password: string };

export function TeamView() {
  const { t } = useLang();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [me, setMe] = useState<string>("");
  const [myRole, setMyRole] = useState<Role>("manager");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load the team.");
      setMembers(body.members);
      setMe(body.me);
      setMyRole(body.myRole);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the team.");
    }
  }, []);

  useEffect(() => {
    // A timer, so the first load is not a state update inside the effect body.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const label = (role: Role) => t(ROLE_LABEL[role].tr, ROLE_LABEL[role].en);
  const owner = members?.find((m) => m.is_owner);
  const others = members?.filter((m) => !m.is_owner) ?? [];

  /** What I may do to this member: owners manage managers and staff, managers manage staff. */
  const canManage = (m: Member) =>
    !m.is_owner && m.id !== me && (myRole === "owner" || (myRole === "manager" && m.role === "staff"));

  const call = async (url: string, init: RequestInit) => {
    setError(null);
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? t("İşlem başarısız.", "That did not work."));
      return null;
    }
    return body;
  };

  const setRole = async (m: Member, role: Role) => {
    await call(`/api/team/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
  };

  const setActive = async (m: Member, active: boolean) => {
    if (!active && !window.confirm(t(`${m.name} çıkarılsın mı? Artık giriş yapamaz.`, `Remove ${m.name}? They will no longer be able to sign in.`))) return;
    await call(`/api/team/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    await load();
  };

  const reset = async (m: Member) => {
    if (!window.confirm(t(`${m.name} için yeni şifre oluşturulsun mu?`, `Create a new password for ${m.name}?`))) return;
    const body = await call(`/api/team/${m.id}/reset-password`, { method: "POST" });
    if (body) setSecret({ name: m.name, phone: m.phone, password: body.temporary_password });
  };

  const active = members ? members.filter((m) => m.is_active).length : 0;
  const canAdd = atLeast(myRole, "manager");

  const memberRow = (m: Member) => (
    <li key={m.id} className="tm-row" data-off={!m.is_active}>
      <div className="tm-avatar">{m.name.slice(0, 1).toUpperCase()}</div>
      <div className="tm-who">
        <div className="tm-name">
          {m.name}
          {m.id === me && <small>{t("(siz)", "(you)")}</small>}
          {!m.is_active && <small>{t("çıkarıldı", "removed")}</small>}
        </div>
        <div className="tm-phone">{m.phone}</div>
      </div>
      {!(canManage(m) && myRole === "owner" && m.is_active) && (
        <span className="tm-badge" data-role={m.role}>{label(m.role)}</span>
      )}
      {canManage(m) && (
        <div className="tm-actions">
          {myRole === "owner" && m.is_active && (
            <select
              className="tm-select"
              value={m.role}
              aria-label={t("Rol", "Role")}
              onChange={(e) => void setRole(m, e.target.value as Role)}
            >
              <option value="manager">{label("manager")}</option>
              <option value="staff">{label("staff")}</option>
            </select>
          )}
          {m.is_active && (
            <button className="fm-ghost" onClick={() => void reset(m)}>
              {t("Şifre sıfırla", "Reset password")}
            </button>
          )}
          <button className={`fm-ghost${m.is_active ? " tm-danger" : ""}`} onClick={() => void setActive(m, !m.is_active)}>
            {m.is_active ? t("Çıkar", "Remove") : t("Geri al", "Restore")}
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="fm-page">
      <h1 className="fm-title">{t("Ekip", "Team")}</h1>
      <p className="fm-sub">{members ? t(`${active} aktif üye`, `${active} active members`) : ""}</p>

      {/* Who can do what, first: it is the thing to know before adding anyone. */}
      <section className="tm-roles" aria-label={t("Roller", "Roles")}>
        {(
          [
            ["owner", "her şeyi görür ve yapar; yöneticileri ve personeli yönetir.", "sees and does everything; manages managers and staff."],
            ["manager", "analiz, sipariş sayfası, ayarlar, ekranlar; personel ekler ve çıkarır.", "analytics, order page, settings, screens; adds and removes staff."],
            ["staff", "yalnızca siparişler ve mutfak ekranı.", "orders and the kitchen screen only."],
          ] as [Role, string, string][]
        ).map(([role, tr, en]) => (
          <div className="tm-role" key={role} data-role={role}>
            <span className="tm-badge" data-role={role}>{label(role)}</span>
            <p>{t(tr, en)}</p>
          </div>
        ))}
      </section>

      {error && <div className="fm-notice">{error}</div>}

      <section className="tm-members">
        <header className="tm-membersHead">
          <h2>
            {t("Üyeler", "Members")}
            {members && <span>{members.length}</span>}
          </h2>
          {canAdd && !adding && (
            <button className="fm-primary" onClick={() => { setAdding(true); setSecret(null); }}>
              + {t("Üye ekle", "Add member")}
            </button>
          )}
        </header>

        {secret && <SecretCard secret={secret} onClose={() => setSecret(null)} />}

        {adding && (
          <AddMember
            myRole={myRole}
            onClose={() => setAdding(false)}
            onAdded={(s) => {
              setAdding(false);
              setSecret(s);
              void load();
            }}
          />
        )}

        <ul className="tm-list">
          {owner && (
            <li className="tm-row tm-ownerRow">
              <div className="tm-avatar">{owner.name.slice(0, 1).toUpperCase()}</div>
              <div className="tm-who">
                <div className="tm-name">
                  {owner.name}
                  {owner.id === me && <small>{t("(siz)", "(you)")}</small>}
                </div>
                <div className="tm-phone">{owner.phone}</div>
              </div>
              <span className="tm-badge" data-role="owner">{label("owner")}</span>
            </li>
          )}
          {members && others.length === 0 && (
            <li className="tm-empty">{t("Henüz başka üye yok. “Üye ekle” ile başlayın.", "No other members yet. Use “Add member” to start.")}</li>
          )}
          {others.map(memberRow)}
        </ul>
      </section>
    </div>
  );
}

function SecretCard({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.password);
      setCopied(true);
    } catch {
      /* the password is selectable on screen */
    }
  };
  return (
    <section className="tm-secret" role="status">
      <strong>
        {t(`${secret.name} için geçici şifre`, `Temporary password for ${secret.name}`)}
      </strong>
      <div className="tm-code">{secret.password}</div>
      <p className="fm-help" style={{ margin: 0 }}>
        {t(
          `Yalnızca bir kez gösterilir. ${secret.phone} numarası ve bu şifreyle giriş yapabilir; özel olarak paylaşın.`,
          `Shown only once. They sign in with ${secret.phone} and this password: share it privately.`,
        )}
      </p>
      <div className="tm-actions">
        <button className="fm-ghost" onClick={() => void copy()}>
          {copied ? t("Kopyalandı", "Copied") : t("Şifreyi kopyala", "Copy password")}
        </button>
        <button className="fm-ghost" onClick={onClose}>{t("Tamam", "Done")}</button>
      </div>
    </section>
  );
}

function AddMember({
  myRole,
  onClose,
  onAdded,
}: {
  myRole: Role;
  onClose: () => void;
  onAdded: (s: Secret) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roles: Role[] = atLeast(myRole, "owner") ? ["staff", "manager"] : ["staff"];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? t("Eklenemedi.", "Could not add the member."));
      } else {
        onAdded({ name: body.member.name, phone: body.member.phone, password: body.temporary_password });
        return;
      }
    } catch {
      setError(t("Sunucuya ulaşılamıyor.", "Can't reach the server."));
    }
    setBusy(false);
  };

  return (
    <form className="fm-card tm-add" onSubmit={(e) => void submit(e)}>
      <h2>{t("Yeni üye", "New member")}</h2>
      <div className="fm-grid2">
        <label className="fm-field">
          <span>{t("Ad", "Name")}</span>
          <input className="fm-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} autoFocus />
        </label>
        <label className="fm-field">
          <span>{t("Telefon (ülke koduyla)", "Phone (with country code)")}</span>
          <input
            className="fm-input"
            type="tel"
            inputMode="tel"
            placeholder="+961 3 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="fm-field">
        <span>{t("Rol", "Role")}</span>
        <div className="fm-options">
          {roles.map((r) => (
            <button type="button" key={r} className="fm-option" aria-pressed={role === r} onClick={() => setRole(r)}>
              {t(ROLE_LABEL[r].tr, ROLE_LABEL[r].en)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="tm-error" role="alert">{error}</p>}
      <div className="tm-actions">
        <button className="fm-primary" type="submit" disabled={busy || !name.trim() || !phone.trim()}>
          {busy ? "…" : t("Üyeyi ekle", "Add member")}
        </button>
        <button className="fm-ghost" type="button" onClick={onClose}>{t("Vazgeç", "Cancel")}</button>
      </div>
    </form>
  );
}
