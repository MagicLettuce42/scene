"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import SceneWordmark from "./scene-wordmark";

const Navigation = createContext<{active: string | null; open: (id: string | null) => void} | null>(null);
export function AccountSettingsShell({identity, profile, syncStatus, children, footer, initialSection}: {
  identity: ReactNode; profile: ReactNode; syncStatus?: ReactNode; children: ReactNode; footer: ReactNode; initialSection?: string | null;
}) {
  const [active, setActive] = useState<string | null>(() => initialSection ? "settings-notifications" : null);
  const root = useRef<HTMLDivElement>(null), previous = useRef<string | null>(null);
  function open(id: string | null) { previous.current = active; setActive(id); }
  useEffect(() => {
    const target = active ? root.current?.querySelector<HTMLElement>("[data-account-heading]") : previous.current ? document.getElementById(`${previous.current}-link`) : null;
    if (target) { target.focus({preventScroll: true}); target.scrollIntoView({block: active ? "start" : "nearest", behavior: "instant"}); }
  }, [active]);
  return <Navigation.Provider value={{active, open}}><div ref={root} className="account-settings account-menu" data-detail={Boolean(active)}>
    <div className="account-menu-brand"><SceneWordmark /></div>
    {active && <button className="account-back" onClick={() => open(null)}><ArrowLeft size={18}/>Account</button>}
    {!active && <><h2 id="dialog-title">Account</h2>{syncStatus}<button id="settings-profile-link" className="account-profile-link" onClick={() => open("settings-profile")}>{identity}<span className="account-edit-label">Edit profile</span><ChevronRight size={20}/></button></>}
    {active === "settings-profile" && <section className="account-detail"><h2 id="dialog-title" data-account-heading tabIndex={-1}>Your profile</h2>{profile}</section>}
    <div className="account-settings-sections">{children}</div>
    {!active && footer}
  </div></Navigation.Provider>;
}
export default function AccountSettingsSection({id, title, description, Icon, status, group, menuDescription = description, children}: {
  id: string; title: string; description: string; Icon: LucideIcon; status?: string; group?: string; menuDescription?: string; children: ReactNode;
}) {
  const navigation = useContext(Navigation);
  if (!navigation) return <section id={id}>{children}</section>;
  if (navigation.active) return navigation.active === id ? <section className="account-detail" id={id}><h2 id="dialog-title" data-account-heading tabIndex={-1}>{title}</h2><p className="account-detail-intro">{description}</p><div className="account-settings-body">{children}</div></section> : null;
  return <>{group && <h3 className="account-menu-group">{group}</h3>}<button className="account-menu-row" id={`${id}-link`} onClick={() => navigation.open(id)}><Icon size={24} aria-hidden="true"/><span className="account-settings-copy"><strong>{title}</strong>{menuDescription && <small>{menuDescription}</small>}</span>{status && <span className="sr-only">{status}</span>}<ChevronRight size={20} aria-hidden="true"/></button></>;
}
