import type { Offer } from "./catalogue";

/** Only expose included viewing options for the selected services. */
export function groupViewingOffers(offers: Offer[], selected: string[]) {
  return {
    included: offers.filter(o => selected.includes(o.key) && (o.type === "sub" || o.type === "free")),
  };
}
export function mergeViewingOffers(standard: Offer[], direct: Offer[] = []) {
  const merged = new Map<string, Offer>();
  for (const offer of [...standard, ...direct]) {
    const key = `${offer.key}:${offer.name.toLowerCase()}:${offer.type}`;
    const previous = merged.get(key);
    merged.set(key, { ...previous, ...offer, price: offer.price ?? previous?.price });
  }
  return [...merged.values()];
}
export function offerDescription(o: Offer) {
  return o.type === "sub" ? "Included with a subscription" : o.type === "free"
    ? o.key === "bbc" ? "TV Licence required" : "Free · may include ads"
    : "";
}
