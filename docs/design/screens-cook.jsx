// COOK MODE COMPARISON
// Three options for the step-by-step cooking experience.

const Cook1_StepByStep = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / weeknight-pasta / cook" />
    <Nav active="Recipes" />
    <div className="wf-body-area center" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="col" style={{ width: "70%", maxWidth: 520, alignItems: "center", textAlign: "center", gap: 12 }}>
        <div className="row between" style={{ width: "100%" }}>
          <span className="wf-pill soft">← exit cook mode</span>
          <span className="small muted">step 2 of 4</span>
          <span className="wf-pill soft">⏲ 0:00</span>
        </div>
        <div className="wf-line" style={{ width: "100%", background: "var(--w-mute-2)" }} />
        <div className="wf-line" style={{ width: "50%", marginTop: -3, background: "var(--w-accent)" }} />

        <div style={{ fontSize: 64, fontFamily: "Caveat, cursive", lineHeight: 1, color: "var(--w-accent)" }}>2</div>
        <div className="wf-h" style={{ fontSize: 30 }}>Build the sauce</div>
        <div className="big">
          Pour in <Amt>28 oz crushed tomatoes</Amt>. Simmer <Amt>10 min</Amt> over medium-low. Season w/ <Amt>1 tsp salt</Amt>.
        </div>
        <div className="row gap-6">
          <span className="wf-pill warn">⏲ start 10:00 timer</span>
        </div>

        <div className="row between" style={{ width: "100%", marginTop: 14 }}>
          <span className="wf-btn">‹ back</span>
          <span className="wf-btn cta big">next step →</span>
        </div>
      </div>
    </div>
    <Annobar>Option 1 · Big text, one step at a time. Swipe / arrow keys. Tap for timers.</Annobar>
  </div>
);

const Cook2_FullScroll = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / weeknight-pasta / cook" />
    <Nav active="Recipes" />
    <div className="wf-body-area">
      <div className="row between">
        <div className="wf-h">Weeknight pasta · cook</div>
        <div className="row gap-6">
          <span className="wf-pill soft">screen on</span>
          <span className="wf-pill soft">read-aloud</span>
        </div>
      </div>

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow">
          <div className="wf-box" style={{ borderLeft: "4px solid var(--w-accent)" }}>
            <div className="bold">1 · Heat the pan</div>
            <div className="big">Warm <Amt>3 Tbsp olive oil</Amt> in a wide pan over medium. Add <Amt>4 cloves garlic</Amt>, sliced thin.</div>
          </div>
          <div className="wf-box">
            <div className="bold">2 · Build the sauce</div>
            <div className="big">Pour in <Amt>28 oz crushed tomatoes</Amt>. Simmer <Amt>10 min</Amt>. Salt to taste.</div>
          </div>
          <div className="wf-box">
            <div className="bold">3 · Pasta</div>
            <div className="big">Boil <Amt>1 lb spaghetti</Amt> in salted water. Reserve <Amt>½ cup pasta water</Amt>.</div>
          </div>
          <div className="wf-box">
            <div className="bold">4 · Finish</div>
            <div className="big">Toss pasta in sauce, add <Amt>¼ cup parmesan</Amt>, loosen w/ pasta water.</div>
          </div>
        </div>

        <div className="col" style={{ width: 240 }}>
          <div className="wf-box fill" style={{ position: "sticky", top: 0 }}>
            <div className="wf-h2">Quick reference</div>
            <div className="small">spaghetti — <Amt>1 lb</Amt></div>
            <div className="small">tomatoes — <Amt>28 oz</Amt></div>
            <div className="small">garlic — <Amt>4 cloves</Amt></div>
            <div className="small">olive oil — <Amt>3 Tbsp</Amt></div>
            <div className="small">parmesan — <Amt>¼ cup</Amt></div>
          </div>
          <div className="wf-box">
            <div className="wf-h2">Timers · 0 running</div>
            <div className="small muted">tap any <Amt>amount of time</Amt> to start a timer</div>
          </div>
          <Anno>Amounts are tappable — tap "10 min" and a timer starts. Tap "1 lb spaghetti" and it checks off in the sidebar.</Anno>
        </div>
      </div>
    </div>
    <Annobar>Option 2 · Full recipe scroll, sticky sidebar reference, inline amounts everywhere. Best for known recipes.</Annobar>
  </div>
);

const Cook3_HandsFree = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / weeknight-pasta / cook?mode=voice" />
    <Nav active="Recipes" />
    <div className="wf-body-area" style={{ background: "var(--w-paper-2)" }}>
      <div className="col grow" style={{ alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div className="row gap-6">
          <span className="wf-pill accent">🎙 hands-free</span>
          <span className="wf-pill soft">screen always on</span>
        </div>

        <div style={{ width: 160, height: 160, borderRadius: "50%", border: "3px solid var(--w-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Caveat, cursive", fontSize: 90, color: "var(--w-accent)" }}>
          7:42
        </div>
        <div className="big muted">simmering · sauce</div>

        <div className="wf-box" style={{ width: "70%", maxWidth: 560 }}>
          <div className="small muted">CURRENT STEP · 2 OF 4</div>
          <div className="wf-h" style={{ fontSize: 26 }}>Simmer the tomatoes</div>
          <div className="big">
            Simmer <Amt>28 oz crushed tomatoes</Amt> with <Amt>1 tsp salt</Amt> for <Amt>10 minutes</Amt>.
          </div>
        </div>

        <div className="row gap-6 small muted">
          <span>say:</span>
          <span className="wf-pill soft">"next step"</span>
          <span className="wf-pill soft">"how much oil?"</span>
          <span className="wf-pill soft">"set a 5 min timer"</span>
          <span className="wf-pill soft">"repeat"</span>
        </div>
      </div>
    </div>
    <Annobar>Option 3 · Voice mode. Big timer, no touching the screen with messy hands.</Annobar>
  </div>
);

Object.assign(window, { Cook1_StepByStep, Cook2_FullScroll, Cook3_HandsFree });
