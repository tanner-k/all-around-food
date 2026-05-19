// Shared sketchy primitives used across all wireframe screens.

const Chrome = ({ url = "allaround.food" }) => (
  <div className="wf-chrome">
    <div className="dot" />
    <div className="dot" />
    <div className="dot" />
    <div className="url">{url}</div>
  </div>
);

const Nav = ({ active = "Home", links = ["Home", "Recipes", "Plan", "Shop", "Pantry"], cta = "+ Import" }) => (
  <div className="wf-nav">
    <div className="logo">all around food</div>
    <div className="links">
      {links.map((l) => (
        <span key={l} className={l === active ? "active" : ""}>{l}</span>
      ))}
    </div>
    <div className="spacer" />
    <div className="wf-pill soft">⌕ search</div>
    <div className="wf-pill accent">{cta}</div>
  </div>
);

const Anno = ({ children, style }) => (
  <div className="wf-anno" style={style}>
    <span className="arrow">↳</span>
    <span>{children}</span>
  </div>
);

const Annobar = ({ children }) => (
  <div className="wf-annobar">{children}</div>
);

const SkelLine = ({ w = "100%", dark = false }) => (
  <div className={"wf-skel" + (dark ? " dark" : "")} style={{ width: w }} />
);

const Photo = ({ style, children }) => (
  <div className="wf-photo" style={style}>{children}</div>
);

// Amount inline pill — the signature "amounts in steps" treatment
const Amt = ({ children }) => <span className="wf-amt">{children}</span>;

// Heading
const H = ({ children, size = 1 }) => (
  <div className={size === 1 ? "wf-h" : "wf-h2"}>{children}</div>
);

// Pill list helper
const Pills = ({ items, accent }) => (
  <div className="row wrap gap-6">
    {items.map((t, i) => (
      <span key={i} className={"wf-pill " + (accent === i ? "accent" : (typeof t === "object" && t.tone ? t.tone : "soft"))}>
        {typeof t === "object" ? t.label : t}
      </span>
    ))}
  </div>
);

// Star rating
const Stars = ({ n = 4 }) => (
  <span className="wf-stars">{"★".repeat(n)}<span style={{ opacity: .25 }}>{"★".repeat(5 - n)}</span></span>
);

// Recipe thumbnail card
const RecipeCard = ({ title, sub, stars, freq, aspect = "4/3" }) => (
  <div className="wf-card">
    <Photo style={{ aspectRatio: aspect }} />
    <div className="meta">
      <div className="title">{title}</div>
      <div className="row between">
        <span className="sub">{sub}</span>
        {typeof stars === "number" ? <Stars n={stars} /> : null}
      </div>
      {freq ? <div className="sub muted">made {freq}× this year</div> : null}
    </div>
  </div>
);

// Day cell for a planner
const DayCell = ({ label, items = [] }) => (
  <div className="wf-day">
    <div className="label">{label}</div>
    {items.map((it, i) => (
      <div key={i} className="wf-box tight small" style={{ background: "var(--w-paper-2)" }}>
        {it}
      </div>
    ))}
    {items.length === 0 ? <div className="wf-box dash tight small muted center" style={{ minHeight: 28 }}>＋</div> : null}
  </div>
);

// Aisle group header
const Aisle = ({ name, count }) => (
  <div className="wf-aisle row between">
    <span>{name}</span>
    <span className="small muted">{count}</span>
  </div>
);

// Checkbox row for shopping list
const CheckRow = ({ on, label, qty, note }) => (
  <div className="row gap-6" style={{ padding: "3px 0" }}>
    <span className={"wf-check" + (on ? " on" : "")} />
    <span className="grow" style={{ textDecoration: on ? "line-through" : "none", color: on ? "var(--w-mute)" : "inherit" }}>
      {label}
    </span>
    {qty ? <span className="small muted">{qty}</span> : null}
    {note ? <span className="small" style={{ color: "var(--w-accent)" }}>{note}</span> : null}
  </div>
);

// Tab bar at the top of body
const TabBar = ({ tabs, active }) => (
  <div className="row gap-12" style={{ borderBottom: "1.5px solid var(--w-line)", paddingBottom: 4 }}>
    {tabs.map((t) => (
      <span key={t} className={t === active ? "wf-h2" : "small muted"} style={t === active ? { color: "var(--w-accent)", borderBottom: "2px solid var(--w-accent)" } : null}>
        {t}
      </span>
    ))}
  </div>
);

Object.assign(window, {
  Chrome, Nav, Anno, Annobar, SkelLine, Photo, Amt, H, Pills, Stars,
  RecipeCard, DayCell, Aisle, CheckRow, TabBar,
});
