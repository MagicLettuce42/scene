"use client";
import { useState } from "react";

/** Keep the same space and accessible name when catalogue artwork is missing. */
export default function PersonPortrait({ name, photo, decorative = false }: { name: string; photo?: string | null; decorative?: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return photo && photo !== failedPhoto ? (
    <img src={photo} alt={decorative ? "" : `Portrait of ${name}`} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedPhoto(photo)} />
  ) : (
    <span className="cast-placeholder" aria-hidden="true">
      {name.trim().slice(0, 1)}
    </span>
  );
}
