"use client";
import { CloudCheck, CloudOff, RefreshCw } from "lucide-react";
export default function SyncStatus({
  status,
  message,
  pending,
  storageWarning,
  syncNow,
}: {
  status: string;
  message: string;
  pending: number;
  storageWarning: boolean;
  syncNow: () => void;
}) {
  const waiting = status === "saving" || status === "connecting",
    problem = status === "error" || status === "offline";
  return (
    <div className={`sync-status ${problem ? "sync-warning" : ""}`}>
      <p role="status" aria-live="polite">
        {waiting ? (
          <RefreshCw size={15} className="spin" />
        ) : status === "saved" ? (
          <CloudCheck size={16} />
        ) : (
          <CloudOff size={16} />
        )}
        <span>
          {status === "saved"
            ? "Saved to your Scene account"
            : status === "saving"
              ? "Saving your changes…"
              : status === "connecting"
                ? "Checking your saved library…"
                : status === "offline"
                  ? "Offline · changes waiting to sync"
                  : "Changes waiting to sync"}
        </span>
      </p>
      <button onClick={syncNow} disabled={waiting}>
        {waiting ? "Syncing…" : "Sync now"}
      </button>
      {problem && (
        <small>
          {message || "Your local copy is available. Changes will sync when you reconnect."}
          {pending > 0 ? ` ${pending} ${pending === 1 ? "update" : "updates"} waiting.` : ""}
        </small>
      )}
      {storageWarning && (
        <small>
          Browser storage is full or unavailable. Keep this page open until your changes finish syncing.
        </small>
      )}
    </div>
  );
}
