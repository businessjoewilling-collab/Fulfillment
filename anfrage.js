// Vercel Serverless Function – /api/anfrage
// Nimmt das Anfrageformular entgegen und schreibt nach Airtable.
// Der Airtable-Token liegt ausschliesslich serverseitig in den Environment Variables.

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'Anfragen';

// Maximale Laenge pro Feld – verhindert, dass jemand die Base vollschreibt
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

  // Honeypot: echtes Formular laesst dieses Feld leer, Bots fuellen es aus.
  if (clean(body.website_url)) {
    return res.status(200).json({ ok: true });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);

  if (!name || !email) {
    return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail-Adresse angeben.' });
  }

  const fields = {
    Name: name,
    Email: email,
    Website: clean(body.shopWebsite, 200),
    Orders: clean(body.orders, 40),
    Peak: clean(body.peak, 60),
    SKUs: clean(body.skus, 40),
    Shopsystem: clean(body.shopsystem, 40),
    Zielmaerkte: clean(body.zielmaerkte, 60),
    Produktart: clean(body.produktart, 80),
    Situation: clean(body.situation, 80),
    Zeithorizont: clean(body.zeithorizont, 40),
    Quelle: clean(body.quelle, 80),
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
      return res.status(502).json({ error: 'Anfrage konnte nicht gespeichert werden.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unerwarteter Fehler:', err);
    return res.status(500).json({ error: 'Anfrage konnte nicht gespeichert werden.' });
  }
};
