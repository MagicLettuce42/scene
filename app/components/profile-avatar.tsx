"use client";
import { useState } from "react";
import { validProfilePhoto } from "../../lib/profile-photo";
export default function ProfileAvatar({ photo, name }: { photo?: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="profile-avatar" aria-hidden="true">
    {photo && photo !== failed && validProfilePhoto(photo)
      ? <img src={photo} alt="" onError={() => setFailed(photo)} />
      : <span>{name.trim().slice(0, 1).toUpperCase() || "S"}</span>}
  </span>;
}
