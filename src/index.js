const DEFAULT_STATE = {
  people: ['Person 1', 'Person 2'],
  cards: [],
  benefits: []
};

const DATA_KEY = 'state';
const CG_PREFIX = 'cg-schedule:week:';
const CG_DATES = [
  '2026-09-13','2026-09-20','2026-09-27','2026-10-04','2026-10-11','2026-10-18','2026-10-25',
  '2026-11-01','2026-11-08','2026-11-15','2026-11-22','2026-11-29','2026-12-06','2026-12-13','2026-12-20','2026-12-27'
];
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function defaultCgWeek(date) {
  return {
    date,
    location: '',
    time: '17:00',
    mainDishes: [],
    sideDishes: [],
    notes: '',
    noGroup: false,
    noGroupReason: '',
    updatedAt: null
  };
}

function cleanString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeDish(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id, 100);
  const name = cleanString(raw.name, 100);
  const household = cleanString(raw.household, 60);
  if (!id || !name) return null;
  return { id, name, household };
}

function normalizeCgWeek(date, raw) {
  const base = defaultCgWeek(date);
  if (!raw || typeof raw !== 'object') return base;
  return {
    date,
    location: cleanString(raw.location, 140),
    time: /^\d{2}:\d{2}$/.test(raw.time || '') ? raw.time : '17:00',
    mainDishes: Array.isArray(raw.mainDishes) ? raw.mainDishes.map(normalizeDish).filter(Boolean) : [],
    sideDishes: Array.isArray(raw.sideDishes) ? raw.sideDishes.map(normalizeDish).filter(Boolean) : [],
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 3000) : '',
    noGroup: !!raw.noGroup,
    noGroupReason: typeof raw.noGroupReason === 'string' ? raw.noGroupReason.slice(0, 500) : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
  };
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

async function handleCgSchedule(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...JSON_HEADERS,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method === 'GET') {
    const values = await Promise.all(CG_DATES.map(date => env.STUBS_DATA.get(`${CG_PREFIX}${date}`, { type: 'json' })));
    const weeks = {};
    CG_DATES.forEach((date, i) => { weeks[date] = normalizeCgWeek(date, values[i]); });
    return json({ weeks });
  }

  if (request.method === 'POST') {
    let incoming;
    try {
      incoming = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const date = cleanString(incoming?.date, 10);
    if (!CG_DATES.includes(date)) return json({ error: 'Invalid Sunday date' }, 400);

    const key = `${CG_PREFIX}${date}`;
    const current = normalizeCgWeek(date, await env.STUBS_DATA.get(key, { type: 'json' }));
    const fields = incoming?.fields && typeof incoming.fields === 'object' ? incoming.fields : {};

    if (Object.prototype.hasOwnProperty.call(fields, 'location')) current.location = cleanString(fields.location, 140);
    if (Object.prototype.hasOwnProperty.call(fields, 'time')) {
      if (!/^\d{2}:\d{2}$/.test(fields.time || '')) return json({ error: 'Invalid time' }, 400);
      current.time = fields.time;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'notes')) current.notes = typeof fields.notes === 'string' ? fields.notes.slice(0, 3000) : '';
    if (Object.prototype.hasOwnProperty.call(fields, 'noGroup')) current.noGroup = !!fields.noGroup;
    if (Object.prototype.hasOwnProperty.call(fields, 'noGroupReason')) current.noGroupReason = typeof fields.noGroupReason === 'string' ? fields.noGroupReason.slice(0, 500) : '';

    const ops = Array.isArray(incoming?.dishOps) ? incoming.dishOps.slice(0, 100) : [];
    for (const op of ops) {
      const listName = op?.section === 'main' ? 'mainDishes' : op?.section === 'side' ? 'sideDishes' : null;
      if (!listName) return json({ error: 'Invalid dish section' }, 400);
      const list = current[listName];

      if (op.type === 'add') {
        const dish = normalizeDish(op.dish);
        if (!dish) return json({ error: 'Dish name is required' }, 400);
        if (!list.some(existing => existing.id === dish.id)) list.push(dish);
      } else if (op.type === 'update') {
        const id = cleanString(op.id, 100);
        const name = cleanString(op.name, 100);
        if (!id || !name) return json({ error: 'Dish name cannot be blank' }, 400);
        const dish = list.find(existing => existing.id === id);
        if (dish) dish.name = name;
      } else if (op.type === 'claim') {
        const id = cleanString(op.id, 100);
        const household = cleanString(op.household, 60);
        if (!id || !household) return json({ error: 'Household is required to claim a dish' }, 400);
        const dish = list.find(existing => existing.id === id);
        if (!dish) return json({ error: 'Dish no longer exists' }, 404);
        if (dish.household) return json({ error: `${dish.name} has already been claimed by ${dish.household}.` }, 409);
        dish.household = household;
      } else if (op.type === 'delete') {
        const id = cleanString(op.id, 100);
        const index = list.findIndex(existing => existing.id === id);
        if (index >= 0) list.splice(index, 1);
      } else {
        return json({ error: 'Invalid dish operation' }, 400);
      }
    }

    current.updatedAt = new Date().toISOString();
    await env.STUBS_DATA.put(key, JSON.stringify(current));
    return json({ ok: true, week: current });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/cg-schedule') return await handleCgSchedule(request, env);
      if (url.pathname === '/api/data' || url.pathname === '/.netlify/functions/data') return await handleData(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error?.message || 'Server error' }, 500);
    }
  }
};
