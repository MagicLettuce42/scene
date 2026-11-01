import { services } from "./catalogue";
export function requestServices(p: URLSearchParams) {
  const selected = [...new Set((p.get("services") || "").split(",").filter(Boolean))],
    offer = p.get("offer") || "sub";
  if (
    !selected.length ||
    selected.length > services.length ||
    selected.some((k) => !services.some((s) => s.key === k)) ||
    !["sub", "free", "all"].includes(offer)
  )
    return null;
  return { selected, offer };
}
