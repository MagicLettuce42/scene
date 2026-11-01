"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Star, LockKeyhole } from "lucide-react";
import type { Title } from "../../lib/catalogue";
import type { ReviewFields } from "../../lib/library-state";
export default function PersonalReview({
  title,
  rating,
  note,
  onChange,
}: {
  title: Title;
  rating: number | null;
  note: string;
  onChange: (title: Title, fields: ReviewFields) => void;
}) {
  const noteId = useId();
  const [draft, setDraft] = useState(note),
    [dirty, setDirty] = useState(false);
  const latest = useRef({ title, onChange, draft: note, dirty: false }),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current.title = title;
  latest.current.onChange = onChange;
  function flush(update = true) {
    if (timer.current) clearTimeout(timer.current);
    const v = latest.current;
    if (v.dirty) {
      v.onChange(v.title, { note: v.draft });
      v.dirty = false;
      if (update) setDirty(false);
    }
  }
  useEffect(() => {
    if (!latest.current.dirty) {
      setDraft(note);
      latest.current.draft = note;
    }
  }, [note]);
  useEffect(() => {
    const save = () => flush(false);
    window.addEventListener("pagehide", save);
    const hidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
      flush(false);
    };
  }, []);
  function changeNote(value: string) {
    setDraft(value);
    setDirty(true);
    latest.current.draft = value;
    latest.current.dirty = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 700);
  }
  return (
    <section className="personal-review" aria-label="Your rating and private note">
      <div className="personal-review-heading">
        <h3>Your take</h3>
        <span>
          <LockKeyhole size={12} /> Private
        </span>
      </div>
      <div className="personal-stars" role="group" aria-label="Your rating out of five">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={rating && n <= rating ? "selected" : ""}
            aria-label={`Rate ${n} out of 5`}
            aria-pressed={rating === n}
            onClick={() => onChange(title, { rating: n })}
          >
            <Star size={23} fill={rating && n <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <div className="personal-rating-summary">
        <span>{rating ? `Your rating: ${rating}/5` : "Not rated yet"}</span>
        {rating && (
          <button className="text-button" onClick={() => onChange(title, { rating: null })}>
            Clear rating
          </button>
        )}
      </div>
      <p className="fine-print">
        Four- and five-star ratings help shape For you. Ratings and notes are not shared with other members;
        database administrators can access stored records.
      </p>
      <label htmlFor={noteId}>Private note</label>
      <textarea
        id={noteId}
        rows={3}
        maxLength={2000}
        placeholder="What did you think? Anything to remember?"
        value={draft}
        onChange={(e) => changeNote(e.target.value)}
        onBlur={() => flush()}
      />
      <div className="note-status">
        <span role="status">{dirty ? "Saving your note…" : "Notes save automatically to your library."}</span>
        <span>{draft.length}/2000</span>
      </div>
    </section>
  );
}
