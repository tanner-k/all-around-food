// DIRECTION C — Library-first (cookbook as home)
// "Your cookbook is the home. AI is a quiet helper. Import is the hero action."

const C1_Library = () => (
  <div className="wf">
    <Chrome url="allaround.food" />
    <Nav active="Home" links={["Home", "Plan", "Shop"]} cta="+ Import recipe" />
    <div className="wf-body-area">
      <div className="row between">
        <div>
          <H>Hi — what are you cooking?</H>
          <div className="small muted">142 recipes · most made first</div>
        </div>
        <div className="row gap-6">
          <span className="wf-pill soft">all</span>
          <span className="wf-pill accent">most made</span>
          <span className="wf-pill soft">new</span>
          <span className="wf-pill soft">untried</span>
          <span className="wf-pill soft">⌕</span>
        </div>
      </div>

      <div className="grow" style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: "minmax(0, 1fr)",
        gap: 12,
        minHeight: 0,
      }}>
        <div className="wf-card" style={{ gridColumn: "span 2", gridRow: "span 2" }}>
          <Photo style={{ flex: 1, aspectRatio: "auto" }} />
          <div className="meta">
            <div className="title" style={{ fontSize: 24 }}>Egg fried rice</div>
            <div className="row between">
              <span className="sub">your most-made · 11×</span>
              <Stars n={5} />
            </div>
          </div>
        </div>
        <RecipeCard title="Weeknight pasta" sub="8× this year" stars={5} />
        <RecipeCard title="Brunch eggs" sub="9× this year" stars={3} />
        <RecipeCard title="Lemon salad" sub="6× this year" stars={4} />
        <RecipeCard title="Spanish tortilla" sub="3× this year" stars={4} />
        <RecipeCard title="Sheet-pan salmon" sub="5× this year" stars={4} />
        <RecipeCard title="Tikka masala" sub="3× this year" stars={5} />
      </div>

      <Anno>Magazine-y feed. Your hits are big, the rest are equal weight. The cookbook YOU made.</Anno>
    </div>
    <Annobar>C · The library IS the home. Pantry & plan are quiet tabs.</Annobar>
  </div>
);

const C2_ImportHero = () => (
  <div className="wf">
    <Chrome url="allaround.food / import" />
    <Nav active="Home" links={["Home", "Plan", "Shop"]} cta="+ Import recipe" />
    <div className="wf-body-area">
      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col grow" style={{ flex: 1.3 }}>
          <H>Save a recipe</H>
          <div className="small muted">Anywhere you find one — drop it in.</div>

          <div className="wf-box dash" style={{ padding: 30, textAlign: "center", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <div style={{ fontSize: 48 }}>⬇</div>
            <div className="wf-h">Drop a screenshot or paste a link</div>
            <div className="small muted">⌘V works anywhere in the app</div>
          </div>

          <div className="row wrap gap-6">
            <span className="wf-pill">📷 Instagram screenshot</span>
            <span className="wf-pill">🎬 TikTok video</span>
            <span className="wf-pill">🔗 NYT Cooking link</span>
            <span className="wf-pill">📧 Email forward</span>
            <span className="wf-pill">✍ Type by hand</span>
          </div>
        </div>

        <div className="col" style={{ width: 320 }}>
          <div className="wf-h2">After AI parses it</div>
          <div className="wf-box flat">
            <div style={{ borderBottom: "1.5px solid var(--w-line)", padding: "8px 10px" }} className="row between">
              <span className="wf-h2" style={{ fontSize: 18 }}>Detected · review</span>
              <Stars n={0} />
            </div>
            <div style={{ padding: 10 }}>
              <Photo style={{ aspectRatio: "16/9" }} />
              <div className="wf-h" style={{ marginTop: 6 }}>Crispy gnocchi w/ tomatoes</div>
              <div className="small muted">parsed from instagram.com/p/abc · 30 min · serves 4</div>
              <div style={{ height: 4 }} />
              <div className="small bold">Ingredients (8)</div>
              <SkelLine w="90%" />
              <SkelLine w="70%" />
              <SkelLine w="80%" />
              <div style={{ height: 4 }} />
              <div className="small bold">Steps (5)</div>
              <SkelLine w="100%" />
              <SkelLine w="90%" />
              <SkelLine w="60%" />
              <div style={{ height: 8 }} />
              <div className="row gap-6">
                <span className="wf-btn">edit</span>
                <span className="wf-btn cta grow">Save to cookbook</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Annobar>The hero. Drop → AI parses → review → save. ~10 sec from screenshot to saved recipe.</Annobar>
  </div>
);

const C3_RecipeMagazine = () => (
  <div className="wf">
    <Chrome url="allaround.food / r / sheet-pan-salmon" />
    <Nav active="Home" links={["Home", "Plan", "Shop"]} cta="+ Import recipe" />
    <div className="wf-body-area">
      <div className="row gap-12 grow" style={{ minHeight: 0 }}>
        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          <Photo style={{ aspectRatio: "4/5" }} />
        </div>
        <div className="col grow" style={{ flex: 1.4, minWidth: 0 }}>
          <div className="small muted">DINNER · WEEKNIGHT · 30 MIN</div>
          <div className="wf-h" style={{ fontSize: 34 }}>Sheet-pan salmon w/ lemon</div>
          <div className="row gap-12 small">
            <span>⏱ 30 min</span>
            <span>🍴 serves 4</span>
            <span>🔥 510 kcal</span>
            <Stars n={4} />
          </div>
          <div className="row gap-6 wrap">
            <span className="wf-pill good">all on hand</span>
            <span className="wf-pill soft">made 5× · last Apr 22</span>
            <span className="wf-pill soft">your notes (2)</span>
          </div>

          <div className="wf-h2" style={{ marginTop: 6 }}>Ingredients · serves <Amt>4</Amt></div>
          <div className="row wrap gap-6 small">
            <span>· salmon fillets <Amt>4 · 6 oz</Amt></span>
            <span>· olive oil <Amt>3 Tbsp</Amt></span>
            <span>· lemon <Amt>1, sliced</Amt></span>
            <span>· asparagus <Amt>1 lb</Amt></span>
            <span>· garlic <Amt>3 cloves</Amt></span>
            <span>· salt + pepper</span>
          </div>

          <div className="wf-h2" style={{ marginTop: 6 }}>Method</div>
          <div className="col gap-6">
            <div>
              <span className="bold">1 </span>
              Heat oven to <Amt>425°F</Amt>. Toss <Amt>1 lb asparagus</Amt> with <Amt>2 Tbsp olive oil</Amt>, salt, pepper.
            </div>
            <div>
              <span className="bold">2 </span>
              Lay <Amt>4 salmon fillets</Amt> on sheet pan, drizzle <Amt>1 Tbsp olive oil</Amt>, top with <Amt>3 garlic cloves</Amt> + <Amt>lemon slices</Amt>.
            </div>
            <div>
              <span className="bold">3 </span>
              Roast <Amt>12 min</Amt>. Salmon flakes; asparagus tender-crisp.
            </div>
          </div>
        </div>
      </div>
    </div>
    <Annobar>Magazine-style reading view. Amounts inline (orange) — never scroll back to ingredients.</Annobar>
  </div>
);

const C4_PantryUtility = () => (
  <div className="wf">
    <Chrome url="allaround.food / pantry" />
    <Nav active="Home" links={["Home", "Plan", "Shop", "Pantry"]} cta="+ Import recipe" />
    <div className="wf-body-area">
      <div className="row between">
        <H>Pantry · quiet utility</H>
        <div className="row gap-6">
          <span className="wf-pill soft">＋ add</span>
          <span className="wf-pill soft">📷 scan receipt</span>
          <span className="wf-pill soft">filter ▾</span>
        </div>
      </div>
      <TabBar tabs={["Have (58)", "Running low (4)", "Shopping list (12)"]} active="Have (58)" />

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
          </div>
        </div>
        <div className="col grow">
          <div className="wf-aisle">Fridge · 14</div>
          <div className="col gap-4 small">
            <div className="row between"><span>butter</span><span className="muted">½ lb</span></div>
            <div className="row between"><span>eggs</span><span className="muted">8</span></div>
            <div className="row between"><span>milk</span><span className="muted">¼ gal · ⚠ low</span></div>
            <div className="row between"><span>parmesan</span><span className="muted">¼ lb</span></div>
            <div className="row between"><span>yogurt</span><span className="muted">½ tub · expires Fri</span></div>
          </div>
        </div>
        <div className="col" style={{ width: 220 }}>
          <div className="wf-box accent">
            <div className="wf-h">Recipes that use what's expiring</div>
            <div className="small">· Yogurt marinade chicken</div>
            <div className="small">· Greek yogurt bowls</div>
          </div>
          <Anno>Same data as A · just framed as a side tool, not the home page.</Anno>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { C1_Library, C2_ImportHero, C3_RecipeMagazine, C4_PantryUtility });
