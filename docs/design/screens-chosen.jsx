// CHOSEN DIRECTION — Planner-first home + Library-as-second-tab
// Nav: Plan · Cookbook · Shop · Pantry · + Import (always)

const NavBC = ({ active = "Plan" }) => (
  <Nav active={active} links={["Plan", "Cookbook", "Shop", "Pantry"]} cta="+ Import" />
);

// ─── X1 · Week (home) ────────────────────────────────────────────────────
const X1_Week = () => (
  <div className="wf">
    <Chrome url="allaround.food / week" />
    <NavBC active="Plan" />
    <div className="wf-body-area">
      <div className="row between">
        <div className="col gap-4">
          <H>Week of May 18</H>
          <div className="small muted">7 meals planned · 23 items to shop · est. $68</div>
        </div>
        <div className="row gap-6">
          <span className="wf-pill soft">‹ prev</span>
          <span className="wf-pill soft">today</span>
          <span className="wf-pill soft">next ›</span>
          <span className="wf-btn cta">Auto-plan ✨</span>
        </div>
      </div>

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        {/* 7-day calendar — left/main */}
        <div className="col grow" style={{ flex: 3, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, flex: 1, minHeight: 0 }}>
            <DayCell label="Mon 18" items={["Weeknight pasta"]} />
            <DayCell label="Tue 19" items={["Tikka masala"]} />
            <DayCell label="Wed 20" items={["Sheet-pan salmon"]} />
            <DayCell label="Thu 21" items={["Leftovers"]} />
            <DayCell label="Fri 22" items={["Pizza night"]} />
            <DayCell label="Sat 23" items={["Roast chicken", "Lemon salad"]} />
            <DayCell label="Sun 24" items={["Brunch eggs"]} />
          </div>
        </div>

        {/* Suggestions rail — right */}
        <div className="col" style={{ width: 240 }}>
          <div className="wf-h2">Drag in →</div>
          <div className="row gap-6">
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Egg fried rice</div><div className="sub">20 min · ★★★★★</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Pho bowl</div><div className="sub">40 min · ★★★★</div></div></div>
          </div>
          <div className="wf-box accent small">
            <div className="bold">💡 buy once, cook twice</div>
            <div>Pin <b>Tomato soup</b> too — 4 ingredients overlap with Mon's pasta.</div>
          </div>
          <div className="wf-box dash small">
            <Anno>Drag any card from the rail onto a day. Or just tap "Auto-plan ✨"</Anno>
          </div>
        </div>
      </div>
    </div>
    <Annobar>Week is home. Plan now, shop once, cook all week.</Annobar>
  </div>
);

// ─── X2 · Cookbook (library, magazine-y — the C view) ───────────────────
const X2_Cookbook = () => (
  <div className="wf">
    <Chrome url="allaround.food / cookbook" />
    <NavBC active="Cookbook" />
    <div className="wf-body-area">
      <div className="row between">
        <div>
          <H>Your cookbook · 142</H>
          <div className="small muted">The recipes you've saved · ranked by what you actually cook</div>
        </div>
        <div className="row gap-6">
          <span className="wf-pill accent">most made</span>
          <span className="wf-pill soft">recent</span>
          <span className="wf-pill soft">untried</span>
          <span className="wf-pill soft">on hand</span>
          <span className="wf-pill soft">⌕ search</span>
        </div>
      </div>
      <div className="row gap-6 wrap small">
        <span className="wf-pill soft">≤ 30 min</span>
        <span className="wf-pill soft">vegetarian</span>
        <span className="wf-pill soft">one pot</span>
        <span className="wf-pill soft">date night</span>
        <span className="wf-pill soft">meal prep</span>
        <span className="wf-pill soft">weeknight</span>
        <span className="wf-pill soft">+ tag</span>
      </div>

      <div className="grow" style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: "minmax(0, 1fr)",
        gap: 12,
        minHeight: 0,
      }}>
        {/* Hero card — most made */}
        <div className="wf-card" style={{ gridColumn: "span 2", gridRow: "span 2" }}>
          <Photo style={{ flex: 1, aspectRatio: "auto" }} />
          <div className="meta">
            <div className="title" style={{ fontSize: 24 }}>Egg fried rice</div>
            <div className="row between">
              <span className="sub">your most-made · 11× this year</span>
              <Stars n={5} />
            </div>
          </div>
        </div>
        <RecipeCard title="Weeknight pasta" sub="8×" stars={5} />
        <RecipeCard title="Brunch eggs" sub="9×" stars={3} />
        <RecipeCard title="Sheet-pan salmon" sub="5×" stars={4} />
        <RecipeCard title="Lemon salad" sub="6×" stars={4} />
        <RecipeCard title="Roast chicken" sub="4×" stars={5} />
        <RecipeCard title="Tikka masala" sub="3×" stars={5} />
      </div>
    </div>
    <Annobar>Cookbook is the second tab. Magazine-y. Tap any card → recipe detail. Drag a card → drop on a day in Plan.</Annobar>
  </div>
);

// ─── X3 · Recipe detail (magazine + inline amounts) ─────────────────────
const X3_RecipeDetail = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / sheet-pan-salmon" />
    <NavBC active="Cookbook" />
    <div className="wf-body-area">
      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          <Photo style={{ aspectRatio: "4/5" }} />
          <div className="row gap-6">
            <span className="wf-pill good">all on hand</span>
            <span className="wf-pill soft">made 5× · last Apr 22</span>
          </div>
          <div className="wf-box fill small">
            <div className="bold">Nutrition · per serving</div>
            <div className="row between"><span>kcal</span><span>510</span></div>
            <div className="row between"><span>protein</span><span>38 g</span></div>
            <div className="row between"><span>carbs</span><span>22 g</span></div>
            <div className="row between"><span>fat</span><span>28 g</span></div>
          </div>
          <div className="row gap-6">
            <span className="wf-btn grow">＋ Plan</span>
            <span className="wf-btn cta grow">Cook now ▶</span>
          </div>
        </div>

        <div className="col grow" style={{ flex: 1.6, minWidth: 0 }}>
          <div className="small muted">DINNER · WEEKNIGHT · 30 MIN</div>
          <div className="wf-h" style={{ fontSize: 32, lineHeight: 1 }}>Sheet-pan salmon w/ lemon</div>
          <div className="row gap-12 small">
            <span>⏱ 30 min</span><span>🍴 serves <Amt>4</Amt></span><Stars n={4} />
            <span className="muted">· source: NYT Cooking</span>
          </div>

          <div className="wf-h2" style={{ marginTop: 4 }}>Ingredients</div>
          <div className="row wrap gap-6 small">
            <span>· salmon fillets <Amt>4 · 6oz</Amt></span>
            <span>· asparagus <Amt>1 lb</Amt></span>
            <span>· olive oil <Amt>3 Tbsp</Amt></span>
            <span>· lemon <Amt>1, sliced</Amt></span>
            <span>· garlic <Amt>3 cloves</Amt></span>
            <span>· salt + pepper</span>
          </div>

          <div className="wf-h2" style={{ marginTop: 4 }}>Method</div>
          <div className="col gap-6">
            <div>
              <span className="bold">1 </span>Heat oven to <Amt>425°F</Amt>. Toss <Amt>1 lb asparagus</Amt> with <Amt>2 Tbsp olive oil</Amt>, salt, pepper. Spread on sheet pan.
            </div>
            <div>
              <span className="bold">2 </span>Lay <Amt>4 salmon fillets</Amt> on top, drizzle <Amt>1 Tbsp olive oil</Amt>, scatter <Amt>3 garlic cloves</Amt> + <Amt>lemon slices</Amt>.
            </div>
            <div>
              <span className="bold">3 </span>Roast <Amt>12 min</Amt>. Salmon should flake; asparagus tender-crisp.
            </div>
          </div>

          <div className="wf-box dash small" style={{ marginTop: 4 }}>
            <div className="bold">Your notes (2)</div>
            <div>· Did 14 min last time, perfect.</div>
            <div>· Add a pinch of red pepper flakes.</div>
          </div>
        </div>
      </div>
    </div>
    <Annobar>Orange underlined = ingredient amount, inline in the step. Tap it to start a timer or check it off. No scrolling back.</Annobar>
  </div>
);

// ─── X4 · Shared-ingredient suggestions ─────────────────────────────────
const X4_Suggestions = () => (
  <div className="wf">
    <Chrome url="allaround.food / week / suggest" />
    <NavBC active="Plan" />
    <div className="wf-body-area">
      <div className="row between">
        <div className="col gap-4">
          <H>Smart suggestions for this week</H>
          <div className="small muted">Pairs and trios that share ingredients · uses what's already in pantry · covers what's running low</div>
        </div>
        <span className="wf-pill soft">Mon 18 → Sun 24 ▾</span>
      </div>

      <div className="grow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 0 }}>
        <div className="wf-box">
          <div className="row between">
            <div className="wf-h2">Trio · 6 shared ingredients</div>
            <span className="wf-pill good small">save ~$14</span>
          </div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Weeknight pasta</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Tomato soup</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Caprese salad</div></div></div>
          </div>
          <div className="row wrap gap-6" style={{ marginTop: 8 }}>
            <span className="wf-pill soft small">tomatoes</span>
            <span className="wf-pill soft small">basil</span>
            <span className="wf-pill soft small">garlic</span>
            <span className="wf-pill soft small">olive oil</span>
            <span className="wf-pill soft small">parmesan</span>
            <span className="wf-pill soft small">salt</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small muted">est. $24 total · 3 dinners</span>
            <span className="wf-btn cta">Add all to week</span>
          </div>
        </div>

        <div className="wf-box">
          <div className="row between">
            <div className="wf-h2">Pair · use the leftovers</div>
            <span className="wf-pill good small">save $8</span>
          </div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Roast chicken</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Chicken stock soup</div></div></div>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Use the carcass for stock the next day · skip a grocery run.</div>
        </div>

        <div className="wf-box">
          <div className="row between">
            <div className="wf-h2">Uses what's running low</div>
            <span className="wf-pill warn small">paprika · olive oil</span>
          </div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Tikka masala</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Béchamel pasta</div></div></div>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>You're about to buy these anyway — these recipes use them up.</div>
        </div>

        <div className="wf-box">
          <div className="wf-h2">Untried in your cookbook</div>
          <div className="small muted">12 recipes you saved but haven't made. AI nudges one weekly.</div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Miso glazed eggplant</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Chickpea curry</div></div></div>
          </div>
        </div>
      </div>
    </div>
    <Annobar>The "buy once, cook twice" engine. Ingredient overlap is the magic.</Annobar>
  </div>
);

// ─── X5 · Auto shopping list ────────────────────────────────────────────
const X5_Shop = () => (
  <div className="wf">
    <Chrome url="allaround.food / shop" />
    <NavBC active="Shop" />
    <div className="wf-body-area">
      <div className="row between">
        <div className="col gap-4">
          <H>Shopping list · this week</H>
          <div className="small muted">Auto-generated from 7 planned meals · grouped by store aisle</div>
        </div>
        <div className="row gap-6">
          <span className="wf-pill soft">📍 Kroger ▾</span>
          <span className="wf-pill soft">walk vs. delivery ▾</span>
          <span className="wf-btn cta">Send to Kroger pickup</span>
        </div>
      </div>

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow">
          <Aisle name="Produce" count="9" />
          <div className="row wrap gap-6">
            <CheckRow label="tomatoes" qty="6" />
            <CheckRow label="onions" qty="3" />
            <CheckRow label="garlic" qty="2 heads" />
            <CheckRow label="lemons" qty="3" />
            <CheckRow label="basil" qty="1 bunch" />
            <CheckRow label="cilantro" qty="1 bunch" />
            <CheckRow label="carrots" qty="1 lb" />
            <CheckRow label="celery" qty="1 bunch" />
            <CheckRow label="ginger" qty="1 piece" />
          </div>

          <Aisle name="Meat & seafood" count="3" />
          <CheckRow label="salmon fillets" qty="4 · 6 oz" />
          <CheckRow label="whole chicken" qty="1 · 4 lb" />
          <CheckRow label="shrimp" qty="1 lb" />

          <Aisle name="Spices & oils" count="2" />
          <CheckRow label="paprika" qty="1 jar" note="running low" />
          <CheckRow label="olive oil" qty="1 bottle" note="running low" />

          <Aisle name="Dairy & eggs" count="4" />
          <CheckRow label="eggs" qty="dozen" />
          <CheckRow label="milk" qty="½ gal" note="low" />
          <CheckRow label="butter" qty="1 lb" />
          <CheckRow label="parmesan" qty="¼ lb" />
        </div>

        <div className="col" style={{ width: 240 }}>
          <div className="wf-box accent">
            <div className="wf-h">Est. total</div>
            <div style={{ fontSize: 32, fontFamily: "Caveat, cursive", lineHeight: 1 }}>$68.40</div>
            <div className="small muted">Kroger · pickup Tue 4pm</div>
          </div>
          <div className="wf-box">
            <div className="wf-h2">Each item is for…</div>
            <div className="small">tap any line to see which recipe needs it</div>
          </div>
          <div className="wf-box fill">
            <div className="wf-h2">Pantry already covers</div>
            <div className="small">flour · rice · soy sauce · oregano · cumin · salt</div>
          </div>
          <div className="wf-box dash small">
            <Anno>V2: compare cart Costco · Walmart · Smith's via APIs.</Anno>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── X6 · Import flow (the magic moment) ────────────────────────────────
const X6_Import = () => (
  <div className="wf">
    <Chrome url="allaround.food / import" />
    <NavBC active="Plan" />
    <div className="wf-body-area">
      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col" style={{ flex: 1.2, minWidth: 0 }}>
          <H>Save a recipe</H>
          <div className="small muted">Anywhere you find one — drop it in. ⌘V works on any screen.</div>

          <div className="wf-box dash" style={{ padding: 24, textAlign: "center", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 48 }}>⬇</div>
            <div className="wf-h">Drop a screenshot or paste a link</div>
            <div className="small muted">JPG · PNG · URL · plain text</div>
          </div>

          <div className="row wrap gap-6">
            <span className="wf-pill">📷 Instagram screenshot</span>
            <span className="wf-pill">🎬 TikTok</span>
            <span className="wf-pill">🔗 NYT / Serious Eats</span>
            <span className="wf-pill">📧 Email forward</span>
            <span className="wf-pill">✍ Type by hand</span>
          </div>
          <Anno>iOS share sheet + chrome extension → save without leaving the source app.</Anno>
        </div>

        <div className="col" style={{ width: 340 }}>
          <div className="wf-h2">After AI parses</div>
          <div className="wf-box flat">
            <div style={{ borderBottom: "1.5px solid var(--w-line)", padding: "8px 10px" }} className="row between">
              <span className="bold small">PARSED · REVIEW</span>
              <Stars n={0} />
            </div>
            <div style={{ padding: 10 }}>
              <Photo style={{ aspectRatio: "16/9" }} />
              <div className="wf-h" style={{ marginTop: 6 }}>Crispy gnocchi w/ tomatoes</div>
              <div className="small muted">parsed from instagram.com/p/abc · 30 min · serves 4</div>
              <div style={{ height: 6 }} />
              <div className="small bold">Ingredients (8) — tap to edit</div>
              <div className="small">· gnocchi <Amt>1 lb</Amt></div>
              <div className="small">· cherry tomatoes <Amt>2 cups</Amt></div>
              <div className="small">· garlic <Amt>3 cloves</Amt></div>
              <div className="small muted">+ 5 more</div>
              <div style={{ height: 6 }} />
              <div className="small bold">Tags (auto)</div>
              <div className="row gap-6 wrap" style={{ marginTop: 4 }}>
                <span className="wf-pill soft small">weeknight</span>
                <span className="wf-pill soft small">vegetarian</span>
                <span className="wf-pill soft small">≤ 30 min</span>
              </div>
              <div style={{ height: 10 }} />
              <div className="row gap-6">
                <span className="wf-btn">edit</span>
                <span className="wf-btn cta grow">Save to cookbook</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Annobar>The hero moment. Drop → AI parses → ~10s to a saved, standardized recipe.</Annobar>
  </div>
);

// ─── X7 · Pantry (utility tab) ──────────────────────────────────────────
const X7_Pantry = () => (
  <div className="wf">
    <Chrome url="allaround.food / pantry" />
    <NavBC active="Pantry" />
    <div className="wf-body-area">
      <div className="row between">
        <div className="col gap-4">
          <H>Pantry</H>
          <div className="small muted">58 items · 4 running low · 2 expiring this week</div>
        </div>
        <div className="row gap-6">
          <span className="wf-pill soft">＋ add</span>
          <span className="wf-pill soft">📷 scan receipt</span>
          <span className="wf-pill soft">📸 photo fridge</span>
          <span className="wf-pill soft">filter ▾</span>
        </div>
      </div>
      <TabBar tabs={["All (58)", "Running low (4)", "Expiring soon (2)"]} active="All (58)" />

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow">
          <div className="wf-aisle">Spices & dry goods · 18</div>
          <div className="col gap-4 small">
            <div className="row between"><span>paprika</span><span className="muted">½ jar · ⚠ low</span></div>
            <div className="row between"><span>cumin</span><span className="muted">full</span></div>
            <div className="row between"><span>oregano</span><span className="muted">full</span></div>
            <div className="row between"><span>olive oil</span><span className="muted">⅙ bottle · ⚠ low</span></div>
            <div className="row between"><span>soy sauce</span><span className="muted">full</span></div>
            <div className="row between"><span>flour</span><span className="muted">2 lb</span></div>
            <div className="row between"><span>rice (jasmine)</span><span className="muted">3 lb</span></div>
          </div>
        </div>
        <div className="col grow">
          <div className="wf-aisle">Fridge · 14</div>
          <div className="col gap-4 small">
            <div className="row between"><span>butter</span><span className="muted">½ lb</span></div>
            <div className="row between"><span>eggs</span><span className="muted">8</span></div>
            <div className="row between"><span>milk</span><span className="muted">¼ gal · ⚠ low</span></div>
            <div className="row between"><span>parmesan</span><span className="muted">¼ lb</span></div>
            <div className="row between"><span>yogurt</span><span className="muted" style={{ color: "var(--w-bad)" }}>½ tub · expires Fri</span></div>
            <div className="row between"><span>greek yogurt</span><span className="muted">1 tub</span></div>
          </div>
        </div>
        <div className="col" style={{ width: 220 }}>
          <div className="wf-box accent">
            <div className="wf-h">Use it up</div>
            <div className="small muted">Expires Fri · yogurt</div>
            <div className="small">· Yogurt marinade chicken</div>
            <div className="small">· Greek yogurt bowls</div>
            <div className="small">· Tzatziki + pita</div>
          </div>
          <div className="wf-box fill">
            <div className="wf-h2">How pantry updates</div>
            <div className="small">· Auto from completed shopping list</div>
            <div className="small">· Auto-decrement when you cook a recipe</div>
            <div className="small">· Scan receipt</div>
            <div className="small">· Photo of fridge (V2)</div>
            <div className="small">· Manual edit anytime</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── X8 · Information architecture map ──────────────────────────────────
const X8_Map = () => (
  <div className="wf">
    <div className="wf-body-area" style={{ padding: "20px 24px" }}>
      <div className="col gap-4">
        <H>How it all fits together</H>
        <div className="small muted">Plan is home. Cookbook is the browse view. Shop + Pantry are the data plumbing.</div>
      </div>

      <div className="grow" style={{ position: "relative", minHeight: 0 }}>
        <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          {/* Connecting lines */}
          <g stroke="var(--w-line)" strokeWidth="1.5" fill="none" strokeDasharray="4 3">
            <line x1="200" y1="80" x2="400" y2="80" />
            <line x1="400" y1="80" x2="600" y2="80" />
            <line x1="200" y1="80" x2="200" y2="280" />
            <line x1="600" y1="80" x2="600" y2="280" />
            <line x1="400" y1="80" x2="400" y2="280" />
            <line x1="100" y1="280" x2="700" y2="280" />
          </g>
        </svg>

        <div style={{ position: "absolute", left: "20%", top: 20, transform: "translateX(-50%)" }}>
          <div className="wf-box accent" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h">📅 Plan</div>
            <div className="small">Week is home. Drag recipes onto days.</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: "50%", top: 20, transform: "translateX(-50%)" }}>
          <div className="wf-box" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h">📖 Cookbook</div>
            <div className="small">Magazine-y. Your recipes ranked by use.</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: "80%", top: 20, transform: "translateX(-50%)" }}>
          <div className="wf-box" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h">🛒 Shop</div>
            <div className="small">Auto from plan. Grouped by aisle.</div>
          </div>
        </div>

        <div style={{ position: "absolute", left: "20%", top: 220, transform: "translateX(-50%)" }}>
          <div className="wf-box fill" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h2">🥘 Pantry</div>
            <div className="small">Source of truth for what you have.</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: "50%", top: 220, transform: "translateX(-50%)" }}>
          <div className="wf-box fill" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h2">＋ Import</div>
            <div className="small">Always available. Hero action.</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: "80%", top: 220, transform: "translateX(-50%)" }}>
          <div className="wf-box fill" style={{ width: 180, textAlign: "center" }}>
            <div className="wf-h2">📊 Stats</div>
            <div className="small">How often, nutrition trends, $$ over time.</div>
          </div>
        </div>
      </div>

      <div className="wf-box" style={{ background: "var(--w-paper-2)" }}>
        <div className="bold">Key principles</div>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          <li>One source of truth: <b>pantry</b>. Recipes know what you have. Shop knows what you need.</li>
          <li>Plan and cookbook are <b>two views of the same data</b> — your recipes. Plan is "now". Cookbook is "always".</li>
          <li>Amounts live inline in steps. Always.</li>
          <li>Import is one tap from anywhere — ⌘V, share sheet, chrome extension.</li>
        </ul>
      </div>
    </div>
  </div>
);

Object.assign(window, { X1_Week, X2_Cookbook, X3_RecipeDetail, X4_Suggestions, X5_Shop, X6_Import, X7_Pantry, X8_Map });
