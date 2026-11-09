import { clientRegion } from "../../lib/region-client";
import { ArrowUpRight } from "lucide-react";

// A provider search is a way to check a title, never evidence of availability.
export default function ProviderSearch({ query }: { query: string }) {
  if (clientRegion() !== "GB") return null;
  return <div className="provider-search">
    <a className="text-button" href={`https://www.bbc.co.uk/iplayer/search?q=${encodeURIComponent(query)}`}
      target="_blank" rel="noopener noreferrer">
      Search BBC iPlayer <ArrowUpRight size={14} />
    </a>
    <p className="fine-print">Check directly, including BBC One and BBC Two programmes. This search link does not confirm availability.</p>
  </div>;
}
