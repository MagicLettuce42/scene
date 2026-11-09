import type { Offer, Title } from "./catalogue";

// Reviewed UK feed discrepancies only. Exact identities prevent corrections
// leaking to remakes, sequels or series. Re-review before extending expiry.
const corrections = [{
  tmdbId: 71679,
  kind: "movie",
  provider: "disney",
  reviewedOn: "2026-11-03",
  expiresAt: "2026-11-10T00:00:00Z",
  source: "https://www.justwatch.com/uk/movie/resident-evil-retribution",
  message: "Disney+ was removed from this listing after a UK availability review on 3 November 2026. The UK guide listed rental and purchase options only.",
}] as const;

export function availabilityCorrection(title: Pick<Title, "id" | "kind" | "tmdbId" | "availabilityRegion">, now = Date.now()) {
  if (title.availabilityRegion === "US") return;
  return corrections.find(c => c.kind === title.kind &&
    (title.tmdbId === c.tmdbId || title.id === `tmdb-movie-${c.tmdbId}`) &&
    now >= Date.parse(c.reviewedOn) && now < Date.parse(c.expiresAt));
}

export function correctedOffers(title: Pick<Title, "id" | "kind" | "tmdbId" | "availabilityRegion">, offers: Offer[], now = Date.now()) {
  const correction = availabilityCorrection(title, now);
  return correction ? offers.filter(o => o.key !== correction.provider) : offers;
}
