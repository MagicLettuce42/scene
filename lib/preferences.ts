import { sameTitle, type Title } from "./catalogue";
export type Feedback = { title: Title; watched: boolean; liked: boolean; hidden: boolean };
export type FeedbackAction = "watched" | "liked" | "hidden";
export const feedbackKey = "scene.feedback.v1";
export function readFeedback(): Feedback[] {
  try {
    const list = JSON.parse(localStorage.getItem(feedbackKey) || "[]");
    return Array.isArray(list)
      ? list
          .filter(
            (x) =>
              x?.title &&
              typeof x.title.id === "string" &&
              typeof x.title.name === "string" &&
              Array.isArray(x.title.offers) &&
              Array.isArray(x.title.genres),
          )
          .slice(0, 1000)
          .map((x) => ({
            ...x,
            watched: x.watched === true,
            liked: x.liked === true,
            hidden: x.hidden === true,
          }))
      : [];
  } catch {
    return [];
  }
}
export function findFeedback(items: Feedback[], title: Title) {
  return items.find((x) => sameTitle(x.title, title));
}
export function changeFeedback(items: Feedback[], title: Title, action: FeedbackAction): Feedback[] {
  const old = findFeedback(items, title),
    next = {
      title,
      watched: old?.watched || false,
      liked: old?.liked || false,
      hidden: old?.hidden || false,
      [action]: !old?.[action],
    };
  if (action === "liked" && next.liked) next.hidden = false;
  if (action === "hidden" && next.hidden) next.liked = false;
  const others = items.filter((x) => !sameTitle(x.title, title));
  return next.watched || next.liked || next.hidden ? [next, ...others].slice(0, 1000) : others;
}
export function visibleSuggestions(titles: Title[], feedback: Feedback[], hideWatched = true) {
  return titles.filter((t) => {
    const f = findFeedback(feedback, t);
    return !f?.hidden && (!hideWatched || !f?.watched);
  });
}
