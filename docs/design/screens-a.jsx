// DIRECTION A — Pantry-first
// "Your kitchen is the source of truth. Recipes are filtered by what you have."

const A1_Pantry = () => (
  <div className="wf">
    <Chrome url="allaround.food / pantry" />
    <Nav active="Pantry" />
    <div className="wf-body-area">
      <div className="row between">
        <H>What's in your kitchen</H>
        <div className="row gap-6">
          <span className="wf-pill soft">＋ add item</span>
          <span className="wf-pill soft">📷 scan receipt</span>
          <span className="wf-pill soft">📸 photo fridge</span>
        </div>
      </div>

      <div className="row gap-6 wrap">
        <span className="wf-pill warn">⚠ Running low · 4</span>
        <span className="wf-pill good">✓ Fresh · 32</span>
        <span className="wf-pill soft">Expiring soon · 2</span>
        <span className="wf-pill soft">All · 58</span>
      </div>

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow" style={{ flex: 2, minWidth: 0 }}>
          <div className="wf-aisle">Spices & dry goods</div>
          <div className="row wrap gap-6">
            <span className="wf-pill warn">paprika · low</span>
            <span className="wf-pill">cumin</span>
            <span className="wf-pill">oregano</span>
            <span className="wf-pill warn">olive oil · low</span>
            <span className="wf-pill">flour · 2lb</span>
            <span className="wf-pill">salt</span>
            <span className="wf-pill">black pepper</span>
            <span className="wf-pill">soy sauce</span>
          </div>
          <div className="wf-aisle">Produce</div>
          <div className="row wrap gap-6">
            <span className="wf-pill">onions · 3</span>
            <span className="wf-pill">garlic · 1 head</span>
            <span className="wf-pill warn">tomatoes · 1</span>
            <span className="wf-pill">lemons · 2</span>
            <span className="wf-pill">cilantro</span>
          </div>
          <div className="wf-aisle">Fridge & dairy</div>
          <div className="row wrap gap-6">
            <span className="wf-pill">butter · ½ lb</span>
            <span className="wf-pill">eggs · 8</span>
            <span className="wf-pill warn">milk · ¼ gal</span>
            <span className="wf-pill">parmesan</span>
          </div>
        </div>

        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          <div className="wf-box accent">
            <div className="wf-h">Make something now</div>
            <div className="small">14 recipes use only what you have</div>
            <div style={{ height: 6 }} />
            <div className="row gap-6"><span>🥘</span><span>Weeknight pasta</span></div>
            <div className="row gap-6"><span>🍳</span><span>Spanish tortilla</span></div>
            <div className="row gap-6"><span>🥗</span><span>Lemon herb salad</span></div>
            <div style={{ height: 4 }} />
            <span className="wf-btn cta">See all 14 →</span>
          </div>
          <div className="wf-box dash">
            <Anno>Tap any "low" pill to drop it into the shopping list</Anno>
          </div>
        </div>
      </div>
    </div>
    <Annobar>A · Pantry is the home. Low-stock chips drive the shopping list.</Annobar>
  </div>
);

const A2_RecipeDetail = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / weeknight-pasta" />
    <Nav active="Recipes" />
    <div className="wf-body-area">
      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          <Photo style={{ aspectRatio: "4/3" }} />
          <div className="wf-h">Weeknight tomato pasta</div>
          <div className="row gap-6 small muted">
            <span>25 min</span>·<span>serves 4</span>·<Stars n={5} />
          </div>
          <div className="row gap-6 wrap">
            <span className="wf-pill good">all ingredients on hand</span>
            <span className="wf-pill soft">made 8× this year</span>
          </div>
          <div className="wf-h2" style={{ marginTop: 6 }}>Ingredients</div>
          <div className="col gap-4 small">
            <CheckRow label="spaghetti" qty="1 lb" />
            <CheckRow label="tomatoes, crushed" qty="28 oz" note="have" />
            <CheckRow label="garlic" qty="4 cloves" />
            <CheckRow label="olive oil" qty="3 Tbsp" note="low" />
            <CheckRow label="parmesan" qty="¼ cup" />
          </div>
        </div>

        <div className="col" style={{ flex: 1.4, minWidth: 0 }}>
          <div className="row between">
            <div className="wf-h2">Steps</div>
            <div className="row gap-6">
              <span className="wf-pill soft">📖 Cook mode</span>
              <span className="wf-pill soft">🔁 1× ▾</span>
            </div>
          </div>
          <div className="wf-box">
            <div className="bold">1 · Heat the pan</div>
            <div className="small">Warm <Amt>3 Tbsp olive oil</Amt> in a wide pan over medium. Add <Amt>4 cloves garlic</Amt>, sliced thin.</div>
          </div>
          <div className="wf-box">
            <div className="bold">2 · Build the sauce</div>
            <div className="small">Pour in <Amt>28 oz crushed tomatoes</Amt>. Simmer 10 min, season w/ <Amt>1 tsp salt</Amt>.</div>
          </div>
          <div className="wf-box">
            <div className="bold">3 · Pasta</div>
            <div className="small">Cook <Amt>1 lb spaghetti</Amt> in salted water. Reserve <Amt>½ cup pasta water</Amt>.</div>
          </div>
          <div className="wf-box">
            <div className="bold">4 · Finish</div>
            <div className="small">Toss pasta in sauce w/ <Amt>¼ cup parmesan</Amt>. Loosen w/ pasta water.</div>
          </div>
          <Anno>Inline amounts (the orange underlines) are the killer feature. No scrolling back.</Anno>
        </div>
      </div>
    </div>
  </div>
);

const A3_Shopping = () => (
  <div className="wf">
    <Chrome url="allaround.food / shop" />
    <Nav active="Shop" />
    <div className="wf-body-area">
      <div className="row between">
        <H>Shopping list</H>
        <div className="row gap-6">
          <span className="wf-pill soft">Kroger ▾</span>
          <span className="wf-pill soft">Sort: aisle ▾</span>
          <span className="wf-btn cta">Send to Kroger</span>
        </div>
      </div>
      <div className="small muted">12 items · from "low-stock" + this week's plan · est. $42</div>

      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow">
          <Aisle name="Produce" count="4" />
          <CheckRow on label="yellow onions" qty="2" />
          <CheckRow label="garlic" qty="1 head" />
          <CheckRow label="lemons" qty="3" />
          <CheckRow label="cilantro" qty="1 bunch" />

          <Aisle name="Spices & oils" count="2" />
          <CheckRow label="paprika" qty="1 jar" note="running low" />
          <CheckRow label="olive oil" qty="1 bottle" note="running low" />

          <Aisle name="Dairy & eggs" count="3" />
          <CheckRow label="milk" qty="½ gal" />
          <CheckRow label="parmesan" qty="¼ lb" />
          <CheckRow label="butter" qty="1 lb" />
        </div>
        <div className="col" style={{ width: 200 }}>
          <div className="wf-box accent">
            <div className="wf-h">Need this for</div>
            <div className="small">· Weeknight pasta</div>
            <div className="small">· Spanish tortilla</div>
            <div className="small">· Tikka masala</div>
          </div>
          <div className="wf-box dash small">
            <Anno>Future: store comparison — Costco vs Walmart vs Smith's</Anno>
          </div>
        </div>
      </div>
    </div>
    <Annobar>Grouped by store aisle so you walk the store once. Linked back to which recipe each item is for.</Annobar>
  </div>
);

const A4_Import = () => (
  <div className="wf">
    <Chrome url="allaround.food / import" />
    <Nav active="Recipes" />
    <div className="wf-body-area center" style={{ justifyContent: "center", alignItems: "center" }}>
      <div className="col gap-12" style={{ alignItems: "center", maxWidth: 480 }}>
        <H>Drop a recipe in</H>
        <div className="small muted">Screenshot from Instagram · paste a link · type it out · forward an email</div>

        <div className="wf-box dash" style={{ width: 480, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>⬇</div>
          <div className="big">Drop screenshot or photo here</div>
          <div className="small muted">or paste a URL</div>
          <div style={{ height: 10 }} />
          <div className="wf-box tight" style={{ background: "var(--w-paper-2)" }}>
            https://instagram.com/p/_______
          </div>
        </div>

        <div className="row gap-6">
          <span className="wf-pill">📷 photo</span>
          <span className="wf-pill">🔗 link</span>
          <span className="wf-pill">✍ type it</span>
          <span className="wf-pill">📧 forward</span>
        </div>

        <div className="wf-box accent" style={{ width: 480 }}>
          <div className="wf-h">After you drop something</div>
          <div className="small">→ AI extracts title, ingredients, steps, photo</div>
          <div className="small">→ Converts to your standardized format</div>
          <div className="small">→ Inserts amounts inline in steps</div>
          <div className="small">→ Pulls nutrition + suggests tags</div>
        </div>
      </div>
    </div>
    <Annobar>The "magic moment" — screenshot in, clean recipe out.</Annobar>
  </div>
);

const A5_WhatCanIMake = () => (
  <div className="wf">
    <Chrome url="allaround.food / pantry / cook-now" />
    <Nav active="Pantry" />
    <div className="wf-body-area">
      <div className="row between">
        <H>What can I make right now?</H>
        <div className="row gap-6">
          <span className="wf-pill soft">≤ 30 min ▾</span>
          <span className="wf-pill soft">dinner ▾</span>
          <span className="wf-pill accent">all on hand</span>
        </div>
      </div>
      <div className="small muted">14 recipes use only ingredients in your pantry · 6 more if you grab 1 thing</div>

      <div className="grow" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, minHeight: 0 }}>
        <RecipeCard title="Weeknight pasta" sub="25 min" stars={5} freq={8} />
        <RecipeCard title="Spanish tortilla" sub="35 min" stars={4} freq={3} />
        <RecipeCard title="Lemon herb salad" sub="10 min" stars={4} freq={6} />
        <RecipeCard title="Egg fried rice" sub="20 min" stars={5} freq={11} />
        <RecipeCard title="Garlic shrimp" sub="15 min" stars={4} freq={2} />
        <RecipeCard title="Misto soup" sub="40 min" stars={3} freq={1} />
        <div className="wf-card">
          <div className="wf-photo" style={{ aspectRatio: "4/3", opacity: .5 }} />
          <div className="meta">
            <div className="title">Tikka masala</div>
            <div className="sub" style={{ color: "var(--w-warn)" }}>missing: paprika</div>
          </div>
        </div>
        <div className="wf-card">
          <div className="wf-photo" style={{ aspectRatio: "4/3", opacity: .5 }} />
          <div className="meta">
            <div className="title">Roast chicken</div>
            <div className="sub" style={{ color: "var(--w-warn)" }}>missing: thyme</div>
          </div>
        </div>
      </div>
      <Anno>Sorted by "what you make most often" first — your hits float up.</Anno>
    </div>
  </div>
);

Object.assign(window, { A1_Pantry, A2_RecipeDetail, A3_Shopping, A4_Import, A5_WhatCanIMake });
