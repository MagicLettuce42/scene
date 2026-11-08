"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Gamepad2 } from "lucide-react";
import { services } from "../../lib/catalogue";
import { themes, type ThemeId } from "../../lib/themes";
import { ServiceMark } from "./catalogue-cards";
import ThemePicker from "./theme-picker";
import SceneWordmark from "./scene-wordmark";
import InstallScene from "./install-scene";
export default function Welcome({
  name,
  selected,
  theme,
  gamingEnabled,
  onComplete,
  onCancel,
}: {
  name: string;
  selected: string[];
  theme: ThemeId;
  gamingEnabled: boolean;
  onComplete: (selected: string[], theme: ThemeId, gaming: boolean) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0),
    [choices, setChoices] = useState(selected),
    [palette, setPalette] = useState(theme),
    [gaming, setGaming] = useState(gamingEnabled);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = palette;
    return () => {
      document.documentElement.dataset.theme = theme;
    };
  }, [palette, theme]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  return (
    <main className="welcome-page">
      <div className="welcome-brand">
        <SceneWordmark />
      </div>
      <section className="welcome-card">
        <p className="eyebrow">MAKE YOURSELF AT HOME · {step + 1} OF 3</p>
        <div className="welcome-steps" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((n) => (
            <span key={n} className={n <= step ? "done" : ""} />
          ))}
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {step === 0 ? `Welcome, ${name}.` : step === 1 ? "Find your colour." : "Your Scene is ready."}
        </h1>
        {step === 0 ? (
          <>
            <p className="modal-intro">
              Which services do you watch? We’ll use these to find your films and series.
            </p>
            <div className="service-options">
              {services.map((s) => (
                <label key={s.key} className={choices.includes(s.key) ? "chosen" : ""}>
                  <ServiceMark serviceKey={s.key} />
                  <span>
                    {s.name}
                    {s.key === "bbc" && <small>BBC One &amp; BBC Two</small>}
                  </span>
                  <input
                    type="checkbox"
                    checked={choices.includes(s.key)}
                    onChange={() =>
                      setChoices((v) => (v.includes(s.key) ? v.filter((k) => k !== s.key) : [...v, s.key]))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="welcome-gaming-option">
              <Gamepad2 size={24} aria-hidden="true" />
              <span><strong>Include Gaming</strong><small>Discover games, track what you play and see upcoming releases. Optional; change it later in Account settings.</small></span>
              <input type="checkbox" checked={gaming} onChange={(event) => setGaming(event.target.checked)} />
            </label>
            <p className="fine-print">
              Choose at least one, including free services if you use them. Add-on channels need their own
              subscription. You can change this later.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <p className="modal-intro">Choose a look that feels like you. Everyone gets their own theme.</p>
            <ThemePicker
              value={palette}
              onChange={setPalette}
              description="Preview a theme now. We’ll save it when you start browsing."
            />
          </>
        ) : (
          <>
            <p className="modal-intro">
              {choices.length} services · {themes.find((t) => t.id === palette)?.name} theme · Gaming {gaming ? "on" : "off"}
            </p>
            <div className="welcome-summary">
              <p>
                <Check size={17} /> Your watchlist and episode progress stay private.
              </p>
              <p>
                <Check size={17} /> Share individual lists only when you choose.
              </p>
              <p>
                <Check size={17} /> Your choices follow your Scene sign-in.
              </p>
            </div>
            <InstallScene />
          </>
        )}
        <div className="welcome-actions">
          {step > 0 ? (
            <button className="button secondary" onClick={() => setStep((n) => n - 1)}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : onCancel ? (
            <button className="text-button" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <span />
          )}
          <button
            className="button primary"
            disabled={step === 0 && !choices.length}
            onClick={() => (step < 2 ? setStep((n) => n + 1) : onComplete(choices, palette, gaming))}
          >
            {step === 2 ? "Start browsing" : "Continue"} <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
