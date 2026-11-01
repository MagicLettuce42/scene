"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Copy,
  Users,
  Check,
  LoaderCircle,
  Palette,
  Gamepad2,
  Bell,
  ShieldCheck,
  Download,
  Settings2,
  Star,
  ChartPie,
  MessageSquare,
  LogOut,
  ChevronRight,
} from "lucide-react";
import AccountSettingsSection, { AccountSettingsShell } from "./account-settings-section";
import ProfileAvatar from "./profile-avatar";
import ProfilePhotoEditor from "./profile-photo-editor";
import { sceneFetch, signOutScene } from "../../lib/auth/client";
import AccountSecurity, { VerifyTwoFactor } from "./two-factor";
import { useAccount } from "./scene-access";
import GamingSettings, { type GamingSettingsProps } from "./gaming-settings";
import HomeSettings from "./home-settings";
import type { HomePreferences } from "../../lib/home-preferences";
import { ReminderSettings } from "./release-reminders";
import AvailabilityAlerts from "./availability-alerts";
import type { Title } from "../../lib/catalogue";
import InstallScene from "./install-scene";
import { AppUpdateSettings } from "./app-updates";
import AccountDataControls from "./account-data-controls";
import ThemePicker from "./theme-picker";
import { themes, type ThemeId } from "../../lib/themes";
import { effectiveTheme } from "../../lib/seasonal";
type AccessList = {
  members: { user_id: string; display_name: string; active: boolean; role: string }[];
  invites: { token_hash: string; label: string; expires_at: string }[];
};
export default function AccountPanel({
  avatar,
  onAvatarChange,
  onOpen,
  onManageReleases,
  onOpenFollowing,
  pending,
  theme,
  onThemeChange,
  seasonal,
  onSeasonalChange,
  onSetup,
  home,
  onHomeChange,
  syncStatus,
  experienceSettings,
  tasteProfileSettings,
  feedbackSettings,
  initialSection,
  onInitialSectionHandled,
  viewingSettings,
  ...gaming
}: GamingSettingsProps & {
  avatar: string | null;
  onAvatarChange: (value: string | null) => void;
  onOpen: (title: Title) => void;
  onManageReleases: () => void;
  onOpenFollowing?: () => void;
  home: HomePreferences;
  onHomeChange: (fields: Partial<HomePreferences>) => void;
  pending: number;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  seasonal: boolean;
  onSeasonalChange: (value: boolean) => void;
  onSetup: () => void;
  syncStatus?: ReactNode;
  experienceSettings?: ReactNode;
  tasteProfileSettings?: ReactNode;
  feedbackSettings?: ReactNode;
  initialSection?: string | null;
  onInitialSectionHandled?: () => void;
  viewingSettings?: ReactNode;
}) {
  const account = useAccount(),
    [email, setEmail] = useState(""),
    [list, setList] = useState<AccessList | null>(null),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [confirmRevoke, setConfirmRevoke] = useState("");
  useEffect(() => { if (initialSection) onInitialSectionHandled?.(); }, []);
  async function action(body: Record<string, string>) {
    const r = await sceneFetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      data = (await r.json()) as AccessList & { url?: string; error?: string };
    if (!r.ok) throw Error(data.error || "This could not be completed.");
    return data;
  }
  async function refresh() {
    try {
      setList(await action({ action: "list" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (account.role === "owner" && account.security.adminReady) void refresh();
    else setList(null);
  }, [account.role, account.security.adminReady]);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    setCopied(false);
    try {
      const d = await action({ action: "invite", email });
      setLink(d.url || "");
      setEmail("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(userId: string) {
    setBusy(true);
    setError("");
    try {
      await action({ action: "revoke", userId });
      setConfirmRevoke("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    setBusy(true);
    try {
      await action({ action: "cancel-invite", id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (pending) return;
    setBusy(true);
    try {
      await signOutScene();
      location.reload();
    } catch {
      setError("Sign-out could not finish. Please try again.");
      setBusy(false);
    }
  }
  return (
    <AccountSettingsShell initialSection={initialSection} syncStatus={syncStatus}
      identity={<><span className="account-settings-avatar"><ProfileAvatar photo={avatar} name={account.name} /></span><strong className="account-profile-name">{account.name}</strong><span className="account-settings-role">{account.role === "owner" ? "Owner" : "Member"}</span></>}
      profile={<><p className="fine-print">{account.email}</p><ProfilePhotoEditor photo={avatar} name={account.name} userId={account.id} onChange={onAvatarChange} /></>}
      footer={<>{onOpenFollowing && <button className="account-menu-row" onClick={onOpenFollowing}><Users size={24} aria-hidden="true"/><span className="account-settings-copy"><strong>Following</strong><span>Actors and directors you follow</span></span><ChevronRight size={20} aria-hidden="true"/></button>}<div className="account-signout">{pending > 0 && <p className="fine-print">Let your pending changes finish syncing before signing out.</p>}<button className="account-menu-row" disabled={busy || pending > 0} onClick={signOut}><LogOut size={24} aria-hidden="true"/><span className="account-settings-copy"><strong>Sign out</strong></span><ChevronRight size={20} aria-hidden="true"/></button></div></>}
    >
        <AccountSettingsSection
          id="settings-appearance"
          group="Personalise"
          title="Appearance & home"
          description="Theme, layout and spoilers"
          Icon={Palette}
          status={themes.find((t) => t.id === effectiveTheme(theme, seasonal))?.name}
        >
          <label className="seasonal-setting">
            <input
              type="checkbox"
              checked={seasonal}
              onChange={(event) => onSeasonalChange(event.target.checked)}
            />
            <span>
              <strong>Seasonal themes</strong>
              <small>Use seasonal colours when an event is on. Your usual theme returns afterwards.</small>
            </span>
          </label>
          {viewingSettings}
          <ThemePicker
            value={theme}
            onChange={onThemeChange}
            description="Choose a theme to apply it straight away. Your choice saves to your account and follows you across devices."
          />
          <HomeSettings embedded gamingEnabled={gaming.gamingEnabled} value={home} onChange={onHomeChange} />
          <button className="text-button" onClick={onSetup}>
            Run welcome setup again
          </button>
        </AccountSettingsSection>
        {tasteProfileSettings && <AccountSettingsSection id="settings-taste" title="Your taste profile" description="Your genres, decades and film-versus-TV mix" Icon={ChartPie}>
          {tasteProfileSettings}
        </AccountSettingsSection>}
        <AccountSettingsSection id="settings-experience" title="Recommendations" description="Favourites and discovery" Icon={Star}>
          {experienceSettings}
        </AccountSettingsSection>
        <AccountSettingsSection
          id="settings-gaming" menuDescription="Platforms and play list"
          title="Gaming"
          description="Show Gaming, choose platforms and manage your play list"
          Icon={Gamepad2}
          status={gaming.gamingEnabled ? "On" : "Off"}
        >
          <GamingSettings {...gaming} />
        </AccountSettingsSection>
        <AccountSettingsSection
          id="settings-notifications" menuDescription="Reminders and streaming alerts"
          title="Notifications"
          description="Release reminders, device notifications and now streaming alerts"
          Icon={Bell}
        >
          <ReminderSettings />
          <AvailabilityAlerts onOpen={onOpen} />
        </AccountSettingsSection>
        <AccountSettingsSection
          id="settings-security" menuDescription=""
          group="Account"
          title="Security & sessions"
          description="Authenticators, recovery and your other signed-in devices"
          Icon={ShieldCheck}
          status={account.security.enrolled ? "Two-factor on" : "Two-factor off"}
        >
          <AccountSecurity
            owner={account.role === "owner"}
            pending={pending}
            onChanged={() => window.dispatchEvent(new Event("scene:session-check"))}
          />
        </AccountSettingsSection>
        <AccountSettingsSection
          id="settings-data" menuDescription=""
          title="Your data & account"
          description="Download your Scene data or permanently delete your account"
          Icon={Download}
        >
          <AccountDataControls accountId={account.id} pending={pending} />
        </AccountSettingsSection>
        <AccountSettingsSection id="settings-feedback" menuDescription="" group="Help & management" title="Feedback" description="Suggestions and optional performance sharing" Icon={MessageSquare}>
          {feedbackSettings}
        </AccountSettingsSection>
        <AccountSettingsSection
          id="settings-install" menuDescription=""
          title="Install & updates"
          description="Install Scene and check for the latest version"
          Icon={Download}
        >
          <AppUpdateSettings pending={pending} />
          <InstallScene />
        </AccountSettingsSection>
        {account.role === "owner" && (
          <AccountSettingsSection
            id="settings-owner" menuDescription=""
            title="Owner tools"
            description="Release management, people and invitations"
            Icon={Settings2}
          >
            {account.role === "owner" && (
              <section className="account-security">
                <h3>Release management</h3>
                <p>Review feed health, update announcements and fix artwork.</p>
                <button className="button secondary" onClick={onManageReleases}>
                  Manage releases
                </button>
              </section>
            )}
            {account.role === "owner" && !account.security.adminReady && (
              <VerifyTwoFactor
                heading="Verify to manage people and invitations"
                onVerified={() => window.dispatchEvent(new Event("scene:session-check"))}
              />
            )}
            {account.role === "owner" && account.security.adminReady && (
              <section className="access-manager">
                <h3>People can sign up themselves</h3>
                <p className="fine-print">Share Scene’s <a href="/signup" target="_blank" rel="noopener noreferrer">sign-up page</a>. New members confirm their email and get their own watchlist automatically.</p>
                <h3>Optional invitation</h3>
                <p className="fine-print">
                  Create a private link for their email, then share it yourself. It expires after 7 days. A
                  new link can also reset their Scene password.
                </p>
                <form onSubmit={invite} className="invite-form">
                  <label className="sr-only" htmlFor="invite-email">
                    Email to invite
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    placeholder="Their email address"
                    required
                  />
                  <button className="button primary" disabled={busy}>
                    {busy ? <LoaderCircle size={16} className="spin" /> : "Create invite"}
                  </button>
                </form>
                {link && (
                  <div className="invite-result">
                    <label>
                      Private invitation link
                      <input value={link} readOnly onFocus={(e) => e.target.select()} />
                    </label>
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setCopied(true);
                        } catch {
                          setError("Select the invitation link and copy it manually.");
                        }
                      }}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
                    </button>
                    <p className="fine-print">
                      Only share this with the person you invited. Creating another invite for this email
                      replaces this link.
                    </p>
                  </div>
                )}
                <h3>People with access</h3>
                <p className="fine-print">Email addresses are hidden in people and invitation lists.</p>
                {list?.members.map((m) => (
                  <div className="access-row" key={m.user_id}>
                    <div>
                      <strong>{m.display_name}</strong>
                      <small>
                        {m.role === "owner" ? "Owner" : m.active ? "Active" : "Access removed"}
                      </small>
                    </div>
                    {m.role !== "owner" &&
                      m.active &&
                      (confirmRevoke === m.user_id ? (
                        <div>
                          <button disabled={busy} onClick={() => revoke(m.user_id)}>
                            Remove access
                          </button>
                          <button onClick={() => setConfirmRevoke("")}>Keep access</button>
                        </div>
                      ) : (
                        <button disabled={busy} onClick={() => setConfirmRevoke(m.user_id)}>
                          Remove
                        </button>
                      ))}
                  </div>
                ))}
                {Boolean(list?.invites.length) && (
                  <>
                    <h3>Pending invitations</h3>
                    {list!.invites.map((i) => (
                      <div className="access-row" key={i.token_hash}>
                        <span>{i.label || "Pending invitation"}<small>Expires {new Date(i.expires_at).toLocaleDateString("en-GB")}</small></span>
                        <button disabled={busy} onClick={() => cancel(i.token_hash)}>
                          Cancel
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {!list && (
                  <button className="text-button" onClick={refresh}>
                    Load people
                  </button>
                )}
              </section>
            )}
          </AccountSettingsSection>
        )}
      {error && <p className="error-notice" role="alert">{error}</p>}
    </AccountSettingsShell>
  );
}
