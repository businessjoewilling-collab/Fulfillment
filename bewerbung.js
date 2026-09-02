// Vercel Serverless Function – /api/bewerbung
// Nimmt die 3PL-Bewerbung entgegen und schreibt nach Airtable.

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = '3PL-Bewerbungen';

const MAX = 500;

function clean(value, max = MAX) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!AIRTABLE_BASE || !AIRTABLE_TOKEN) {
    console.error('Airtable env vars fehlen');
    return res.status(500).json({ error: 'Server nicht konfiguriert' });
  }

  const body = req.body || {};

  // Honeypot
  if (clean(body.website_url)) {
    return res.status(200).json({ ok: true });
  }

  const firma = clean(body.firma, 160);
  const website = clean(body.website, 200);
  const ansprechpartner = clean(body.ansprechpartner, 120);
  const email = clean(body.email, 160);

  if (!firma || !website || !ansprechpartner || !email) {
    return res.status(400).json({ error: 'Bitte alle Pflichtfelder ausfuellen.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail-Adresse angeben.' });
  }

  const fields = {
    Firma: firma,
    Website: website,
    Ansprechpartner: ansprechpartner,
    Email: email,
    Standorte: clean(body.standorte, 200),
    CH_Fit: clean(body.chFit, 40),
    Min_Orders: clean(body.minOrders, 40),
    Max_Orders: clean(body.maxOrders, 40),
    Integrationen: clean(body.integrationen, 300),
    Spezialisierung: clean(body.spezialisierung, 300),
    Datum: new Date().toISOString()
  };

  try {
    const r = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(TABLE)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: [{ fields }] })
      }
    );

    if (!r.ok) {
      const detail = await r.text();
      console.error('Airtable-Fehler:', r.status, detail);
      return res.status(502).json({ error: 'Bewerbung konnte nicht gespeichert werden.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unerwarteter Fehler:', err);
    return res.status(500).json({ error: 'Bewerbung konnte nicht gespeichert werden.' });
  }
};
