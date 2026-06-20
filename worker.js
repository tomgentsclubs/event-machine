const VENUE_WEBHOOK_ENV = {
  "Maggie Mays Pattaya":   "WEBHOOK_MAGGIE_MAYS_PATTAYA",
  "Club Fate":             "WEBHOOK_CLUB_FATE",
  "The Camel Toe":         "WEBHOOK_THE_CAMEL_TOE",
  "Catflaps":              "WEBHOOK_CATFLAPS",
  "Maggie Mays Jomtien":   "WEBHOOK_MAGGIE_MAYS_JOMTIEN",
  "Free Willy":            "WEBHOOK_FREE_WILLY",
  "Maggie Mays Darkside":  "WEBHOOK_MAGGIE_MAYS_DARKSIDE",
  "Maggie Mays Resort":    "WEBHOOK_MAGGIE_MAYS_RESORT",
  "Bradleys":              "WEBHOOK_BRADLEYS",
  "The Brass House":       "WEBHOOK_THE_BRASS_HOUSE",
  "Maggie Mays Beer Bar":  "WEBHOOK_MAGGIE_MAYS_BEER_BAR",
};

const ALLOWED_ORIGINS = [
  "https://tomgentsclubs.github.io",
  "https://event-machine.pattayapilot.com",
];

function corsHeaders(origin, methods = "POST, GET, OPTIONS") {
  const headers = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function postToDiscord(label, url, body) {
  if (!url) return { label, ok: false, error: "No webhook URL configured" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (r.ok || r.status === 204) return { label, ok: true };
    return { label, ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { label, ok: false, error: e.message };
  }
}

const CALENDAR_URL = "https://tomgentsclubs.github.io/pattayapilot/api/v1/events/index.json";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (url.pathname === "/history" || url.pathname.startsWith("/history/")) {
      const headers = corsHeaders(origin, "GET, POST, DELETE, OPTIONS");
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/history/")) {
        const id = decodeURIComponent(url.pathname.slice("/history/".length));
        if (!id) return json({ ok: false, error: "Missing id" }, 400, headers);
        await env.EVENT_HISTORY.delete(`history:${id}`);
        return json({ ok: true }, 200, headers);
      }
      if (request.method === "GET" && url.pathname === "/history") {
        const list = await env.EVENT_HISTORY.list({ prefix: "history:" });
        const entries = await Promise.all(
          list.keys.map(k => env.EVENT_HISTORY.get(k.name, { type: "json" }))
        );
        const sorted = entries.filter(Boolean).sort((a, b) =>
          new Date(b.savedAt) - new Date(a.savedAt)
        );
        return json(sorted, 200, headers);
      }
      if (request.method === "POST" && url.pathname === "/history") {
        let entry;
        try { entry = await request.json(); } catch {
          return json({ ok: false, error: "Invalid JSON" }, 400, headers);
        }
        if (!entry || !entry.id) {
          return json({ ok: false, error: "Entry with id required" }, 400, headers);
        }
        await env.EVENT_HISTORY.put(`history:${entry.id}`, JSON.stringify(entry));
        return json({ ok: true }, 200, headers);
      }
      return json({ ok: false, error: "Method not allowed" }, 405, headers);
    }

    if (url.pathname === "/calendar") {
      const headers = corsHeaders(origin, "GET, OPTIONS");
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, 405, headers);
      }
      try {
        const r = await fetch(CALENDAR_URL);
        if (!r.ok) {
          return json({ ok: false, error: `Upstream HTTP ${r.status}` }, 502, headers);
        }
        const data = await r.text();
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      } catch (e) {
        return json({ ok: false, error: e.message }, 502, headers);
      }
    }

    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, headers);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid JSON body" }, 400, headers);
    }

    const { venueName, embed, channels } = payload || {};
    if (!venueName || !embed) {
      return json({ ok: false, error: "venueName and embed are required" }, 400, headers);
    }

    const envKey = VENUE_WEBHOOK_ENV[venueName];
    const venueWebhookUrl = envKey ? env[envKey] : undefined;
    if (!venueWebhookUrl) {
      return json({ ok: false, error: `Unknown venue: ${venueName}` }, 400, headers);
    }

    const wantVenue   = channels?.venue   !== false;
    const wantGeneral = channels?.general !== false;
    if (!wantVenue && !wantGeneral) {
      return json({ ok: false, error: "No channels selected" }, 400, headers);
    }

    const body = JSON.stringify({ embeds: [embed] });

    const tasks = [];
    if (wantVenue)   tasks.push(postToDiscord(venueName, venueWebhookUrl, body));
    if (wantGeneral) tasks.push(postToDiscord("General Channel", env.WEBHOOK_GENERAL, body));

    const results = await Promise.all(tasks);
    const allOk = results.every(r => r.ok);

    return json({ ok: allOk, results }, 200, headers);
  },
};
