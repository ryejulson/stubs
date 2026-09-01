const DEFAULT_STATE = {
  people: ['Person 1', 'Person 2'],
  cards: [],
  benefits: []
};

const DATA_KEY = 'state';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

async function handleData(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method === 'GET') {
    const existing = await env.STUBS_DATA.get(DATA_KEY, { type: 'json' });
    return json(existing || DEFAULT_STATE);
  }

  if (request.method === 'POST') {
    let incoming;
    try {
      incoming = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const existing = await env.STUBS_DATA.get(DATA_KEY, { type: 'json' });
    const existingCardCount = Array.isArray(existing?.cards) ? existing.cards.length : 0;
    const incomingCardCount = Array.isArray(incoming?.cards) ? incoming.cards.length : 0;

    if (existingCardCount > 0 && incomingCardCount === 0) {
      return json({
        error: `Refused: this write would wipe out ${existingCardCount} existing card(s) with zero. Delete cards individually in the app instead.`
      }, 409);
    }

    await env.STUBS_DATA.put(DATA_KEY, JSON.stringify(incoming));
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/data' || url.pathname === '/.netlify/functions/data') {
        return await handleData(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error?.message || 'Server error' }, 500);
    }
  }
};
