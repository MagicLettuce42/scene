import { AsyncLocalStorage } from "node:async_hooks";
import { isRegion, type Region } from "./region";
const context = new AsyncLocalStorage<Region>();
export const catalogueRegion = (): Region => context.getStore() || "GB";
export function runWithRegion<T>(region: Region, task: () => T): T { return context.run(region, task); }
// Every regional handler gets an isolated context, including streamed searches.
// The country is a viewing preference, never an authorization decision.
export function regionalHandler<T extends unknown[]>(handler: (req: Request, ...args: T) => Promise<Response>) {
  return (req: Request, ...args: T) => {
    const region = new URL(req.url).searchParams.get("region") || "GB";
    if (!isRegion(region)) return Promise.resolve(Response.json({ error: "Choose United Kingdom or United States." }, { status: 400, headers: { "Cache-Control": "no-store" } }));
    return runWithRegion(region, () => handler(req, ...args));
  };
}
