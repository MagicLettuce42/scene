export const regions = [
  { code: "GB", name: "United Kingdom", short: "UK", guide: "uk" },
  { code: "US", name: "United States", short: "US", guide: "us" },
] as const;
export type Region = (typeof regions)[number]["code"];
export const isRegion = (value: unknown): value is Region => value === "GB" || value === "US";
export const resolveRegion = (value: unknown): Region => isRegion(value) ? value : "GB";
export const regionInfo = (value: unknown) => regions.find(r => r.code === resolveRegion(value))!;
