import { regionInfo } from "../../lib/region";
import { CalendarDays } from "lucide-react";
import { londonDate } from "../../lib/episode-calendar";
import {
  cleanUpcomingRelease,
  releaseDateText,
  releaseLabel,
  type UpcomingRelease,
} from "../../lib/upcoming";

export default function ReleaseBadge({
  release,
  detail = false,
}: {
  release?: UpcomingRelease;
  detail?: boolean;
}) {
  const value = cleanUpcomingRelease(release);
  if (!value || value.date < londonDate()) return null;
  return (
    <div className={`release-date${detail ? " release-detail" : ""}`}>
      <CalendarDays size={14} aria-hidden="true" />
      <div>
        <time dateTime={value.date}>{releaseDateText(value.date)}</time>
        <span>{releaseLabel(value)}</span>
        {detail && (
          <p>
            {value.kind === "streaming"
              ? `Announced for ${releaseLabel(value)} in ${regionInfo(value.region).name}. Provider announcement reviewed ${releaseDateText(value.verifiedOn)}.`
              : value.kind === "series"
                ? "Original series premiere date; regional streaming may be later."
                : value.kind === "digital"
                  ? "Digital release may be rental or purchase. Subscription availability is not confirmed by this date."
                  : "Cinema release date; this may include a re-release. Streaming availability may follow later."}{" "}
            Dates can change.
          </p>
        )}
        {detail && value.kind === "streaming" && (
          <a className="arrival-source" href={value.sourceUrl} target="_blank" rel="noopener noreferrer">
            Read the official announcement
          </a>
        )}
      </div>
    </div>
  );
}
