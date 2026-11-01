"use client";
import { useRef, useState, type ReactNode, type Ref } from "react";
import { CloudCheck, CloudOff, RefreshCw, Settings2, MoreHorizontal, SlidersHorizontal, ArrowDownWideNarrow, Folder, Shuffle, X } from "lucide-react";

type Panel = "collections" | "sort" | "settings" | "more" | "sync" | null;
export default function WatchlistToolbar({ tab, onTab, count, headingRef, groups, syncStatus, syncDetails,
  collections, collectionName, filters, filtersOpen, onFiltersOpen, filtersActive, sort, settings, onShuffle, canShuffle,
}: {
  tab: string; onTab: (tab: string) => void; count?: number; headingRef?: Ref<HTMLHeadingElement>;
  groups: { id: string; label: string; tabs: string[][] }[];
  syncStatus: string; syncDetails: ReactNode; collections: ReactNode; collectionName?: string;
  filters: ReactNode; filtersOpen: boolean; onFiltersOpen: (open: boolean) => void; filtersActive: boolean;
  sort: ReactNode; settings: ReactNode; onShuffle: () => void; canShuffle: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const activePanel = filtersOpen ? "filters" : panel;
  const secondary = groups.slice(1).flatMap(g => g.tabs).find(([key]) => key === tab)?.[1];
  const syncLabel = syncStatus === "saved" ? "Saved" : syncStatus === "saving" ? "Saving…" :
    syncStatus === "connecting" ? "Connecting…" : syncStatus === "offline" ? "Offline" : "Sync needed";
  const SyncIcon = syncStatus === "saved" ? CloudCheck : ["saving", "connecting"].includes(syncStatus) ? RefreshCw : CloudOff;
  function toggle(next: Exclude<Panel, null> | "filters", button: HTMLButtonElement) {
    opener.current = button;
    onFiltersOpen(next === "filters" && !filtersOpen);
    setPanel(next === "filters" || next === activePanel ? null : next);
  }
  function close() {
    setPanel(null); onFiltersOpen(false); opener.current?.focus();
  }
  function choose(value: string) { onTab(value); close(); }
  return <div className="watchlist-bar" onKeyDown={e => { if(e.key === "Escape" && activePanel) { e.preventDefault(); e.stopPropagation(); close(); } }}>
    <div className="watchlist-heading">
      <h2 id="results-heading" ref={headingRef} tabIndex={-1}>Watchlist{count !== undefined && <span className="heading-count">{count}</span>}</h2>
      <div className="watchlist-heading-actions">
        <button className="watchlist-sync-trigger" aria-label={`Sync status: ${syncLabel}. Show details`} aria-expanded={activePanel === "sync"} aria-controls="watchlist-sync-panel" onClick={e=>toggle("sync",e.currentTarget)}>
          <SyncIcon size={16} aria-hidden="true"/><span aria-live="polite">{syncLabel}</span>
        </button>
        <button className="icon-button" aria-label="Watchlist settings" aria-expanded={activePanel === "settings"} aria-controls="watchlist-settings-panel" onClick={e=>toggle("settings",e.currentTarget)}><Settings2 size={19}/></button>
      </div>
    </div>
    <div className="watchlist-primary-tabs" role="group" aria-label="Watchlist views">
      {groups[0].tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{ onTab(key); setPanel(null); onFiltersOpen(false); }}>{label}</button>)}
      <button className="watchlist-more" aria-label={secondary ? `More Watchlist views: ${secondary}` : "More Watchlist views"} aria-expanded={activePanel === "more"} aria-controls="watchlist-more-panel" onClick={e=>toggle("more",e.currentTarget)}><MoreHorizontal size={19}/><span>More</span></button>
    </div>
    {secondary && <p className="watchlist-view-label">{secondary}</p>}
    <div className="watchlist-control-row" role="group" aria-label="Watchlist controls">
      {tab === "saved" && <button aria-expanded={activePanel === "collections"} aria-controls="watchlist-collections-panel" onClick={e=>toggle("collections",e.currentTarget)}><Folder size={17}/><span>Collections</span>{collectionName && <span className="active-dot" aria-label="Collection selected"/>}</button>}
      {!["shared","stats"].includes(tab) && <button aria-expanded={activePanel === "filters"} aria-controls="watchlist-filters-panel" onClick={e=>toggle("filters",e.currentTarget)}><SlidersHorizontal size={17}/><span>Filters</span>{filtersActive && <span className="active-dot" aria-label="Filters active"/>}</button>}
      {!["shared","stats","watching","calendar"].includes(tab) && <button aria-expanded={activePanel === "sort"} aria-controls="watchlist-sort-panel" onClick={e=>toggle("sort",e.currentTarget)}><ArrowDownWideNarrow size={17}/><span>Sort</span></button>}
    </div>
    {collectionName && tab === "saved" && <p className="watchlist-selection">Collection: {collectionName}</p>}
    {activePanel && <div className="watchlist-panel-heading"><strong>{activePanel === "more" ? "More Watchlist views" : activePanel === "sync" ? "Account sync" : activePanel === "settings" ? "Watchlist settings" : activePanel[0].toUpperCase()+activePanel.slice(1)}</strong><button className="icon-button" aria-label="Close Watchlist controls" onClick={close}><X size={18}/></button></div>}
    <div className="watchlist-panel" id="watchlist-collections-panel" hidden={activePanel!=="collections"}>{collections}</div>
    <div className="watchlist-panel" id="watchlist-filters-panel" hidden={activePanel!=="filters"}>{filters}</div>
    <div className="watchlist-panel" id="watchlist-sort-panel" hidden={activePanel!=="sort"}>{sort}</div>
    <div className="watchlist-panel" id="watchlist-settings-panel" hidden={activePanel!=="settings"}>{settings}</div>
    <div className="watchlist-panel" id="watchlist-sync-panel" hidden={activePanel!=="sync"}>{syncDetails}</div>
    <div className="watchlist-panel watchlist-more-panel" id="watchlist-more-panel" hidden={activePanel!=="more"}>
      {groups.slice(1).map(g=><div key={g.id} role="group" aria-label={g.label}><h3>{g.label}</h3><div className="inline-actions">{g.tabs.map(([key,label])=><button className="filter-button" key={key} aria-pressed={tab===key} onClick={()=>choose(key)}>{label}</button>)}</div></div>)}
      <button className="button secondary" disabled={!canShuffle} onClick={onShuffle}><Shuffle size={17}/>Pick a title for me</button>
    </div>
  </div>;
}
