// DIRECTION B — Planner-first
// "The week is the home. Recipes serve the plan. Shopping list auto-generates."

const B1_Week = () => (
  <div className="wf">
    <Chrome url="allaround.food / week" />
    <Nav active="Plan" links={["Plan", "Recipes", "Shop", "Pantry"]} />
    <div className="wf-body-area">
      <div className="row between">
        <H>Week of May 18</H>
        <div className="row gap-6">
          <span className="wf-pill soft">‹ prev</span>
          <span className="wf-pill soft">today</span>
          <span className="wf-pill soft">next ›</span>
          <span className="wf-btn cta">Auto-plan ✨</span>
        </div>
      </div>

      <div className="grow" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, minHeight: 0 }}>
        <DayCell label="Mon 18" items={["Weeknight pasta", "+ lunch?"]} />
        <DayCell label="Tue 19" items={["Tikka masala"]} />
        <DayCell label="Wed 20" items={["Sheet-pan salmon"]} />
        <DayCell label="Thu 21" items={["Leftovers"]} />
        <DayCell label="Fri 22" items={["Pizza night"]} />
        <DayCell label="Sat 23" items={["Roast chicken", "Lemon salad"]} />
        <DayCell label="Sun 24" items={["Brunch eggs"]} />
      </div>

      <div className="row gap-12">
        <div className="wf-box accent grow">
          <div className="row between">
            <div className="wf-h">This week's shopping list</div>
            <span className="wf-pill">23 items · est. $68 →</span>
          </div>
          <div className="small">Generated from 7 meals · 6 items already in pantry · ⚠ 2 running low covered</div>
        </div>
        <div className="wf-box dash" style={{ width: 280 }}>
          <Anno>Drag a recipe from the library on the right → onto any day. Plan in 30 seconds.</Anno>
        </div>
      </div>
    </div>
    <Annobar>B · Weekly calendar is home. Auto-plan ✨ fills the week using pantry + history.</Annobar>
  </div>
);

const B2_Library = () => (
  <div className="wf">
    <Chrome url="allaround.food / recipes" />
    <Nav active="Recipes" links={["Plan", "Recipes", "Shop", "Pantry"]} />
    <div className="wf-body-area">
      <div className="row between">
        <H>Your cookbook · 142</H>
        <div className="row gap-6">
          <span className="wf-pill accent">most made</span>
          <span className="wf-pill soft">recent</span>
          <span className="wf-pill soft">untried</span>
          <span className="wf-pill soft">⌕ search</span>
        </div>
      </div>
      <div className="row gap-6 wrap small">
        <span className="wf-pill soft">≤ 30 min</span>
        <span className="wf-pill soft">vegetarian</span>
        <span className="wf-pill soft">one pot</span>
        <span className="wf-pill soft">date night</span>
        <span className="wf-pill soft">meal prep</span>
        <span className="wf-pill soft">+ tag</span>
      </div>
      <div className="grow" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, minHeight: 0 }}>
        <RecipeCard title="Egg fried rice" sub="20 min" stars={5} freq={11} />
        <RecipeCard title="Weeknight pasta" sub="25 min" stars={5} freq={8} />
        <RecipeCard title="Lemon salad" sub="10 min" stars={4} freq={6} />
        <RecipeCard title="Spanish tortilla" sub="35 min" stars={4} freq={3} />
        <RecipeCard title="Tikka masala" sub="50 min" stars={5} freq={3} />
        <RecipeCard title="Sheet-pan salmon" sub="30 min" stars={4} freq={5} />
        <RecipeCard title="Roast chicken" sub="1h 20m" stars={5} freq={4} />
        <RecipeCard title="Pho bowl" sub="40 min" stars={4} freq={2} />
        <RecipeCard title="Brunch eggs" sub="15 min" stars={3} freq={9} />
        <RecipeCard title="Garlic shrimp" sub="15 min" stars={4} freq={2} />
      </div>
    </div>
    <Annobar>Library is sorted by frequency by default — the recipes you actually cook rise.</Annobar>
  </div>
);

const B3_Suggestions = () => (
  <div className="wf">
    <Chrome url="allaround.food / week / suggest" />
    <Nav active="Plan" links={["Plan", "Recipes", "Shop", "Pantry"]} />
    <div className="wf-body-area">
      <H>Recipes that go together</H>
      <div className="small muted">Pairs and trios that share ingredients — buy once, cook twice.</div>

      <div className="grow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 0 }}>
        <div className="wf-box">
          <div className="wf-h2">Trio · 6 shared ingredients</div>
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
            <span className="small muted">est. $24 total</span>
            <span className="wf-btn cta">Add all to week</span>
          </div>
        </div>

        <div className="wf-box">
          <div className="wf-h2">Pair · 4 shared ingredients</div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Roast chicken</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Chicken stock soup</div></div></div>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Use the carcass · skip a grocery run.</div>
          <div className="row wrap gap-6" style={{ marginTop: 8 }}>
            <span className="wf-pill soft small">chicken</span>
            <span className="wf-pill soft small">carrots</span>
            <span className="wf-pill soft small">onion</span>
            <span className="wf-pill soft small">thyme</span>
          </div>
        </div>

        <div className="wf-box">
          <div className="wf-h2">Uses what's running low</div>
          <div className="small">paprika · olive oil · milk</div>
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Tikka masala</div></div></div>
            <div className="wf-card grow"><Photo style={{ aspectRatio: "1/1" }} /><div className="meta"><div className="title small">Béchamel pasta</div></div></div>
          </div>
        </div>

        <div className="wf-box dash">
          <Anno>Suggestions update live as you pin recipes to the week.</Anno>
          <div className="small muted" style={{ marginTop: 6 }}>The shared-ingredient overlap is the engine. It saves money + reduces trips.</div>
        </div>
      </div>
    </div>
  </div>
);

const B4_AutoShop = () => (
  <div className="wf">
    <Chrome url="allaround.food / shop?week=may-18" />
    <Nav active="Shop" links={["Plan", "Recipes", "Shop", "Pantry"]} />
    <div className="wf-body-area">
      <div className="row between">
        <H>This week · auto-generated</H>
        <div className="row gap-6">
          <span className="wf-pill soft">edit week</span>
          <span className="wf-pill soft">📍 my Kroger ▾</span>
          <span className="wf-btn cta">Order pickup</span>
        </div>
      </div>
      <div className="small muted">7 meals · 23 items · 6 already in pantry · ⚠ 2 running low folded in</div>

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
          <CheckRow label="paprika" qty="1 jar" note="low" />
          <CheckRow label="olive oil" qty="1 bottle" note="low" />

          <Aisle name="Dairy & eggs" count="4" />
          <CheckRow label="eggs" qty="dozen" />
          <CheckRow label="milk" qty="½ gal" note="low" />
          <CheckRow label="butter" qty="1 lb" />
          <CheckRow label="parmesan" qty="¼ lb" />
        </div>

        <div className="col" style={{ width: 240 }}>
          <div className="wf-box accent">
            <div className="wf-h">Est. total</div>
            <div style={{ fontSize: 30, fontFamily: "Caveat, cursive" }}>$68.40</div>
            <div className="small muted">Kroger · pickup at 4pm</div>
          </div>
          <div className="wf-box">
            <div className="wf-h2">Pantry already covers</div>
            <div className="small">flour · rice · soy sauce · oregano · cumin · salt</div>
          </div>
          <div className="wf-box dash small">
            <Anno>Future: compare cart across Costco / Walmart / Smith's via APIs.</Anno>
          </div>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { B1_Week, B2_Library, B3_Suggestions, B4_AutoShop });
