"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAppInstall } from "./app-install-provider";
import { Bell, Check } from "lucide-react";
import { sceneFetch } from "../../lib/auth/client";
import { useAccount } from "./scene-access";
import { services, type Title } from "../../lib/catalogue";
import { releaseDateText } from "../../lib/upcoming";
import { londonDate } from "../../lib/episode-calendar";
type Reminder = {
  release_id: string;
  scene_releases: {
    id: string;
    title: string;
    release_date: string;
    service_key: string;
    label: string;
    active: boolean;
    source_url: string;
  } | null;
};
type State = { reminders: Reminder[]; publicKey: string | null; endpoints: string[] };
const Context = createContext<{
  state: State;
  loaded: boolean;
  refresh: () => Promise<void>;
  action: (body: unknown) => Promise<void>;
} | null>(null);
export function RemindersProvider({ children }: { children: ReactNode }) {
  const account = useAccount(),
    [state, setState] = useState<State>({ reminders: [], publicKey: null, endpoints: [] }),
    [loaded, setLoaded] = useState(false);
  async function refresh() {
    const r = await sceneFetch("/api/reminders", {}, account.id);
    const data = (await r.json()) as State & { error?: string };
    if (!r.ok) throw Error(data.error || "Reminders could not load.");
    setState(data);
    setLoaded(true);
  }
  async function action(body: unknown) {
    const r = await sceneFetch(
        "/api/reminders",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        account.id,
      ),
      data = (await r.json()) as { error?: string };
    if (!r.ok) throw Error(data.error || "The reminder could not be saved.");
    await refresh();
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, [account.id]);
  return <Context.Provider value={{ state, loaded, refresh, action }}>{children}</Context.Provider>;
}
function useReminders() {
  const c = useContext(Context);
  if (!c) throw Error("Reminders unavailable");
  return c;
}
export function ReminderButton({ title }: { title: Title }) {
  const { state, loaded, action, refresh } = useReminders(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (
    !title.id.startsWith("arrival-") ||
    title.upcomingRelease?.kind !== "streaming" ||
    title.upcomingRelease.date < londonDate()
  )
    return null;
  const id = title.id.slice(8),
    followed = state.reminders.some((r) => r.release_id === id);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (!loaded) {
        await refresh();
        setMessage("Reminders loaded. Choose Remind me to follow this release.");
        return;
      }
      await action({ action: followed ? "unfollow" : "follow", releaseId: id });
      setMessage(
        followed
          ? "Reminder removed."
          : state.endpoints.length
            ? "Reminder saved for the announced release day."
            : "Reminder saved. Enable notifications in your account to receive it on this device.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="release-reminder">
      <button
        className={`button secondary reminder-button ${followed ? "selected" : ""}`}
        disabled={busy}
        aria-pressed={followed}
        onClick={toggle}
      >
        {followed ? <Check size={15} /> : <Bell size={15} />}{" "}
        {busy ? "Saving…" : !loaded ? "Load reminders" : followed ? "Reminder set" : "Remind me"}
      </button>
      {message && (
        <p className="fine-print" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
function keyBytes(value: string) {
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (c) => c.charCodeAt(0));
}
export function ReminderSettings() {
  const install = useAppInstall(),
    [permission, setPermission] = useState<NotificationPermission>("default");
  const needsInstall = install.platform === "ios" && !install.standalone;
  const { state, loaded, action, refresh } = useReminders(),
    [subscription, setSubscription] = useState<PushSubscription | null>(null),
    [supported, setSupported] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration("/")
        .then((r) => r?.pushManager?.getSubscription())
        .then((s) => setSubscription(s || null))
        .catch(() => {});
  }, []);
  const enabled = !!subscription && state.endpoints.includes(subscription.endpoint);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (enabled && subscription) {
        await action({ action: "unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        setSubscription(null);
        setMessage("Notifications are off on this device. Your followed releases remain saved.");
        return;
      }
      if (!state.publicKey) throw Error("Notifications are not ready. Try again shortly.");
      // The permission request must stay in this explicit user click, before awaiting registration.
      const permission = await Notification.requestPermission();
      setPermission(permission);
      if (permission !== "granted")
        throw Error("Notifications are off. You can change permission in your browser or device settings.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Scene is still preparing notifications. Please try again.")),
              15000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      let next = await registration.pushManager.getSubscription();
      if (next) {
        await next.unsubscribe();
        next = null;
      }
      next = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(state.publicKey),
      });
      try {
        await action({ action: "subscribe", subscription: next.toJSON() });
      } catch (e) {
        await next.unsubscribe();
        throw e;
      }
      setSubscription(next);
      setMessage("This device will receive reminders from 9am UK time on announced release days.");
    } catch (e) {
      setMessage((e as Error).message || "Notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="release-reminders" className="reminder-settings">
      <h3>Release reminders</h3>
      <p>
        Follow a streaming film, new series or returning season with <strong>Remind me</strong>. Dates can
        change; a reminder isn’t a guarantee that it is available.
      </p>
      <p className="fine-print">
        Notifications use a private, generic message on your lock screen. Enable each device separately.
      </p>
      {!loaded ? (
        <button className="button secondary" onClick={() => refresh().catch((e) => setMessage(e.message))}>
          Load reminders
        </button>
      ) : needsInstall ? (
        <p className="fine-print">
          To receive reminders on this iPhone or iPad, use Share → Add to Home Screen, open Scene from that
          icon, then enable notifications here.
        </p>
      ) : supported ? (
        <button
          className="button secondary"
          disabled={busy || !state.publicKey || (permission === "denied" && !enabled)}
          onClick={toggle}
        >
          <Bell size={16} />
          {busy
            ? "Updating…"
            : enabled
              ? "Turn off on this device"
              : permission === "denied"
                ? "Notifications blocked in device settings"
                : "Enable notifications on this device"}
        </button>
      ) : (
        <p className="fine-print">
          On iPhone or iPad, add Scene to your Home Screen, open the installed app and return here. Use a
          browser that supports web notifications on Android or desktop.
        </p>
      )}
      {permission === "denied" && !enabled && (
        <p className="fine-print">
          Allow notifications for Scene in your browser or device settings, then reopen the app. Your followed
          releases are still saved.
        </p>
      )}
      {message && (
        <p role="status" className="fine-print">
          {message}
        </p>
      )}
      <div className="reminder-list">
        {state.reminders.length ? (
          state.reminders.map((item) => {
            const r = item.scene_releases;
            return (
              <div className="reminder-item" key={item.release_id}>
                <div>
                  <strong>{r?.title || "Release removed"}</strong>
                  <p>
                    {r?.active
                      ? `${releaseDateText(r.release_date)} · ${services.find((s) => s.key === r.service_key)?.name || ""} · ${r.label}`
                      : "Announcement no longer confirmed"}
                  </p>
                  {r?.active && r.release_date <= londonDate() && (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                      Check the announcement
                    </a>
                  )}
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await action({ action: "unfollow", releaseId: item.release_id });
                    } catch (e) {
                      setMessage((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  aria-label={`Remove reminder for ${r?.title || "release"}`}
                >
                  Remove
                </button>
              </div>
            );
          })
        ) : (
          <p className="fine-print">
            No releases followed yet. Find your next watch in Upcoming → Streaming.
          </p>
        )}
      </div>
    </section>
  );
}
