import http from "node:http";

const port = Number(process.argv[2] ?? 4317);

const product = {
  canonical_product_id: "milk-whole-gallon",
  name: "Whole Milk",
  brand: "Dairy Best",
  size_value: 1,
  size_unit: "gal",
  category: "Dairy",
};

const compareRows = [
  {
    retailer: "kroger",
    store_location_id: "kroger-101",
    price_cents: 299,
    observed_at: "2026-05-20T12:00:00Z",
    rank: 1,
  },
  {
    retailer: "walmart",
    store_location_id: "walmart-202",
    price_cents: 349,
    observed_at: "2026-05-20T12:00:00Z",
    rank: 2,
  },
];

const historyRows = [
  {
    observed_at: "2026-05-18T12:00:00Z",
    retailer: "kroger",
    store_location_id: "kroger-101",
    price_cents: 319,
    was_on_promo: false,
  },
  {
    observed_at: "2026-05-20T12:00:00Z",
    retailer: "kroger",
    store_location_id: "kroger-101",
    price_cents: 299,
    was_on_promo: true,
  },
];

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/pricing/search") {
    const hasZip = /^\d{5}$/.test(url.searchParams.get("zip") ?? "");
    const hasQuery = (url.searchParams.get("q") ?? "").length > 0;
    sendJson(res, 200, { success: true, data: hasZip && hasQuery ? [product] : [] });
    return;
  }

  if (url.pathname === "/pricing/compare") {
    sendJson(res, 200, { success: true, data: compareRows });
    return;
  }

  if (url.pathname === "/pricing/history") {
    sendJson(res, 200, { success: true, data: historyRows });
    return;
  }

  sendJson(res, 404, { success: false, error: `No mock route for ${url.pathname}` });
});

server.listen(port, "127.0.0.1");

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", close);
process.on("SIGINT", close);
