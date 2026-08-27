const { getStore } = require('@netlify/blobs');

const DEFAULT_STATE = {
  people: ['Person 1', 'Person 2'],
  cards: [],
  benefits: []
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const store = getStore({ name: 'stubs-data', consistency: 'strong' });

    if (event.httpMethod === 'GET') {
      const existing = await store.get('state', { type: 'json' });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(existing || DEFAULT_STATE)
      };
    }

    if (event.httpMethod === 'POST') {
      let incoming;
      try {
        incoming = JSON.parse(event.body || '{}');
      } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }
      await store.setJSON('state', incoming);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
};
