import { ArrowUpRight, Info } from "lucide-react";
import { availabilityUrl, safeUrl, type Title, type Offer } from "../../lib/catalogue";
import { groupViewingOffers, offerDescription } from "../../lib/viewing-options";
import { ServiceMark } from "./catalogue-cards";
import ProviderSearch from "./provider-search";

export default function WatchOptions({ title, offers, selected }: { title: Title; offers: Offer[]; selected: string[] }) {
  const { included } = groupViewingOffers(offers, selected);
  const rows = (items: Offer[]) => <div className="offers">{items.map((o, i) => <a key={`${o.key}-${o.name}-${o.type}-${i}`}
    href={safeUrl(o.url) || availabilityUrl(title)} target="_blank" rel="noopener noreferrer">
    <ServiceMark serviceKey={o.key}/><span className="offer-copy"><strong>{o.name}</strong><small>{offerDescription(o)}</small></span>
    <span className="offer-action">{o.linkKind === "guide" || o.url.includes("justwatch.com") ? "View options" : "Open provider"}<ArrowUpRight size={18}/></span>
  </a>)}</div>;
  return <div className="watch-options">
    <h4>On your selected services</h4>
    {included.length ? <><p className="fine-print">Subscription and free options. Check your plan, region and season with the provider.</p>{rows(included)}</> :
      <div className="unknown-box"><Info size={20}/><p>No subscription or free options are confirmed for your current service filter.</p></div>}
    {!included.length && <ProviderSearch query={title.name} />}

  </div>;
}
