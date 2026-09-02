// Vercel Serverless Function – /api/bewertungen
// GET  = liefert nur freigegebene Bewertungen (Feld "Freigegeben" = true)
// POST = legt eine neue Bewertung an, immer unfreigegeben
//
// Wichtig: Ohne den Freigabe-Filter kann jeder Besucher beliebige Bewertungen
// veroeffentlichen. Die Freigabe machst du manuell in Airtable.

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'Bewertungen';

function clean(value, max = 1200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function airtableUrl(query = '') {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(TABLE)}${query}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

module.exports = async (req, res) => {
  if (!AIRTABLE_BASE || !AIRTABLE_TOKEN) {
    console.error('Airtable env vars fehlen');
    return res.status(500).json({ error: 'Server nicht konfiguriert' });
  }

  // ---------- Bewertungen laden ----------
  if (req.method === 'GET') {
    try {
      const query =
        '?filterByFormula=' +
        encodeURIComponent('{Freigegeben}=TRUE()') +
        '&sort%5B0%5D%5Bfield%5D=Datum&sort%5B0%5D%5Bdirection%5D=desc' +
        '&maxRecords=30';

      const r = await fetch(airtableUrl(query), { headers: authHeaders() });
      if (!r.ok) throw new Error(`Airtable ${r.status}`);

      const data = await r.json();

      // Nur die Felder ausliefern, die die Seite wirklich anzeigt.
      const reviews = (data.records || []).map((rec) => ({
        sterne: parseInt(rec.fields.Sterne, 10) || 0,
        text: rec.fields.Text || '',
        name: rec.fields.Name || 'Anonym',
        datum: rec.fields.Datum || ''
      }));

      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ reviews });
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      return res.status(502).json({ error: 'Bewertungen konnten nicht geladen werden.' });
    }
  }

  // ---------- Bewertung abgeben ----------
  if (req.method === 'POST') {
    const body = req.body || {};

    // Honeypot
    if (clean(body.website_url, 200)) {
      return res.status(200).json({ ok: true });
    }

    const sterne = parseInt(body.sterne, 10);
    const text = clean(body.text, 1200);
    const name = clean(body.name, 80) || 'Anonym';

    if (!(sterne >= 1 && sterne <= 5)) {
      return res.status(400).json({ error: 'Bitte eine Bewertung von 1 bis 5 Sternen waehlen.' });
    }
    if (text.length < 10) {
      return res.status(400).json({ error: 'Bitte schreib kurz etwas zu deiner Erfahrung.' });
    }

    try {
      const fields = {
        Sterne: sterne,
        Text: text,
        Name: name,
        Datum: new Date().toISOString().split('T')[0],
        Freigegeben: false
      };

      const r = await fetch(airtableUrl(), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ records: [{ fields }] })
      });

      if (!r.ok) {
        const detail = await r.text();
        console.error('Airtable-Fehler:', r.status, detail);
        return res.status(502).json({ error: 'Bewertung konnte nicht gespeichert werden.' });
      }

      return res.status(200).json({ ok: true, moderation: true });
    } catch (err) {
      console.error('Unerwarteter Fehler:', err);
      return res.status(500).json({ error: 'Bewertung konnte nicht gespeichert werden.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
