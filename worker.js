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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "https://tomgentsclubs.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const { venueName, embed } = payload || {};
    if (!venueName || !embed) {
      return json({ ok: false, error: "venueName and embed are required" }, 400);
    }

    const envKey = VENUE_WEBHOOK_ENV[venueName];
    const venueWebhookUrl = envKey ? env[envKey] : undefined;
    if (!venueWebhookUrl) {
      return json({ ok: false, error: `Unknown venue: ${venueName}` }, 400);
    }

    const body = JSON.stringify({ embeds: [embed] });

    const [venueResult, generalResult] = await Promise.all([
      postToDiscord(venueName, venueWebhookUrl, body),
      postToDiscord("General Channel", env.WEBHOOK_GENERAL, body),
    ]);

    const results = [venueResult, generalResult];
    const allOk = results.every(r => r.ok);

    return json({ ok: allOk, results });
  },
};
