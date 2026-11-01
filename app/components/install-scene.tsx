"use client";
import { Download, Share, Check, MoreVertical } from "lucide-react";
import { useAppInstall } from "./app-install-provider";
export default function InstallScene() {
  const { available, installed, standalone, platform, busy, message, install } = useAppInstall();
  return (
    <section className="install-scene">
      <h3>
        {installed ? (
          <>
            <Check size={18} /> Scene is on your Home Screen
          </>
        ) : (
          <>
            <Download size={18} /> Install Scene
          </>
        )}
      </h3>
      {installed ? (
        <p className="fine-print">
          {standalone
            ? "You’re using the app view. Your account stays the same."
            : "Open the Scene icon from your Home Screen or app drawer. Your account stays the same."}
        </p>
      ) : (
        <>
          <p className="fine-print">
            Available as a web app on Android and iPhone, with its own icon and app window.
          </p>
          {available && (
            <button className="button secondary" disabled={busy} onClick={install}>
              <Download size={16} /> {busy ? "Opening installer…" : "Install Scene"}
            </button>
          )}
          {platform === "ios" ? (
            <ol>
              <li>Open Scene in Safari.</li>
              <li>
                Tap <Share size={14} /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Keep <strong>Open as Web App</strong> enabled, then tap <strong>Add</strong>.
              </li>
            </ol>
          ) : (
            <ol>
              <li>
                Open Scene in <strong>Chrome on Android</strong>.
              </li>
              <li>
                Tap <MoreVertical size={14} /> the menu, then <strong>Add to Home screen</strong> or{" "}
                <strong>Install app</strong>.
              </li>
              <li>
                Choose <strong>Install</strong> when offered, then open the Scene icon.
              </li>
            </ol>
          )}
          {platform === "other" && (
            <p className="fine-print">
              On a computer, use your browser’s install icon or menu. If you opened Scene inside another app,
              open this link in Chrome first.
            </p>
          )}
          <p className="fine-print">
            You may need to sign in once in the app window. Releases, search and account sync need an internet
            connection. If you launch offline, Scene shows a reconnect screen.
          </p>
        </>
      )}
      {message && (
        <p className="fine-print" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
