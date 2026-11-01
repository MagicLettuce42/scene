"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { prepareProfilePhoto } from "../../lib/profile-photo";
import { sessionBoundary } from "../../lib/auth/session-boundary";
import ProfileAvatar from "./profile-avatar";
export default function ProfilePhotoEditor({ photo, name, userId, onChange }: {
  photo: string | null; name: string; userId: string; onChange: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null), generation = useRef(0);
  useEffect(() => { generation.current++; setPreview(null); setError(""); setBusy(false); return () => { generation.current++; }; }, [userId]);
  async function choose(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    setError(""); setBusy(true); setPreview(null);
    try {
      const image = await prepareProfilePhoto(file);
      if (current === generation.current && sessionBoundary().userId === userId) setPreview(image);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally { if (current === generation.current) setBusy(false); }
  }
  return <section className="profile-photo-editor" aria-label="Profile photo">
    <div className="profile-photo-preview"><ProfileAvatar photo={preview || photo} name={name} />
      <div><strong>Your profile photo</strong><p className="fine-print">JPG, PNG or WebP, up to 5 MB. We crop the centre into a square. Your photo stays private and syncs with your account.</p></div>
    </div>
    <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" disabled={busy}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
    <div className="profile-photo-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Camera size={16} />}{busy ? "Preparing photo…" : photo ? "Change photo" : "Choose photo"}
      </button>
      {preview && <><button type="button" className="button primary" onClick={() => {
        if (sessionBoundary().userId !== userId) return;
        onChange(preview); setPreview(null);
      }}>Use this photo</button><button type="button" className="text-button" onClick={() => setPreview(null)}>Cancel</button></>}
      {photo && !preview && <button type="button" className="text-button" disabled={busy} onClick={() => {
        if (sessionBoundary().userId !== userId) return;
        onChange(null); setError("");
      }}><Trash2 size={15} /> Remove photo</button>}
    </div>
    {preview && <p role="status" className="fine-print">Preview ready. Choose “Use this photo” to save it.</p>}
    {error && <p className="error-notice" role="alert">{error}</p>}
  </section>;
}
