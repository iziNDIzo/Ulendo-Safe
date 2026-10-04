require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Server-side only: this must be the SERVICE ROLE key (never put it in public/)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('Supabase URL set?', !!process.env.SUPABASE_URL);
console.log('Supabase service key set?', !!process.env.SUPABASE_SERVICE_KEY);

const REPORT_TYPES = ['robbery', 'harassment', 'reckless_driving', 'fake_identity', 'other'];

// Supabase returns { data, error } instead of throwing, so errors must be checked
function logIfError(label, result) {
  if (result && result.error) console.log(`${label} failed:`, result.error.message);
  return result;
}

// Used ONLY when Supabase cannot be reached, so the demo still answers.
const OFFLINE = {
  'KBA-4521': {
    op: { code: 'KBA-4521', name: 'Kondwani B.', vehicle_type: 'kabaza', bike_model: 'Honda CB125', plate: 'MJ 4521', rating: 4.8, total_trips: 214, status: 'verified' },
    risk: { base_risk: 'green', confirmed_reports: 0, pending_reports: 0 },
    reps: []
  },
  'KBA-9999': {
    op: { code: 'KBA-9999', name: 'UNKNOWN - REPORTED', vehicle_type: 'kabaza', status: 'pending' },
    risk: { base_risk: 'red', confirmed_reports: 2, pending_reports: 0 },
    reps: [
      { type: 'robbery', description: 'Took phone at knife point near roundabout after 10pm', location: 'Ndirande' },
      { type: 'robbery', description: 'Tried to divert to bushy road', location: 'Ndirande' }
    ]
  },
  'TX-2210': {
    op: { code: 'TX-2210', name: 'Mphatso K. (Taxi)', vehicle_type: 'taxi', bike_model: 'Toyota Vitz', plate: 'NB 2210', rating: 4.9, total_trips: 340, status: 'verified' },
    risk: { base_risk: 'green', confirmed_reports: 0, pending_reports: 0 },
    reps: []
  }
};

// ---------- verify ----------
function formatVerify({ op, risk, reps }) {
  const level = risk.base_risk;
  const confirmed = Number(risk.confirmed_reports || 0);
  const pending = Number(risk.pending_reports || 0);
  const isBike = op.vehicle_type === 'kabaza';
  const who = isBike ? 'Rider' : 'Driver';
  const what = isBike ? 'Bike' : 'Vehicle';

  if (level === 'red') {
    let msg = `🚨 DO NOT BOARD - HIGH RISK\nCode: ${op.code}\nName: ${op.name}`;
    if (confirmed > 0) {
      const lines = reps
        .map(r => `- ${r.description || r.type} (${r.location || 'location not given'})`)
        .join('\n');
      msg += `\n⚠️ ${confirmed} serious report${confirmed === 1 ? '' : 's'}:\n${lines}`;
      if (confirmed > reps.length) msg += `\n- ...and ${confirmed - reps.length} more`;
    } else {
      msg += `\nThis operator has been suspended.`;
    }
    return msg;
  }

  if (level === 'yellow') {
    const reasons = [];
    if (op.status === 'pending') reasons.push('Not yet verified by an association.');
    if (pending > 0) reasons.push(`${pending} report${pending === 1 ? '' : 's'} under review.`);
    return `⚠️ CAUTION - NOT FULLY VERIFIED\n${who}: ${op.name}\nCode: ${op.code}\n${reasons.join('\n')}\nAsk to see their ID and share your trip with someone you trust.`;
  }

  return `✅ VERIFIED\n${who}: ${op.name}\nCode: ${op.code}\n${what}: ${op.bike_model || 'n/a'}, Plate ${op.plate || 'n/a'}\n⭐ ${op.rating ?? 'n/a'} (${op.total_trips || 0} trips)\n\nNo serious reports.`;
}

async function handleVerify(tokens) {
  const code = (tokens[1] || '').toUpperCase();
  if (!code) return 'Type: verify KBA-4521';

  let data = null;
  let offline = false;

  try {
    const [opRes, riskRes, repRes] = await Promise.all([
      supabase.from('operators').select('*').eq('code', code).maybeSingle(),
      supabase.from('operator_risk').select('*').eq('code', code).maybeSingle(),
      supabase.from('reports')
        .select('type, description, location')
        .eq('reported_code', code)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true })
        .limit(3)
    ]);
    logIfError('operators lookup', opRes);
    logIfError('operator_risk lookup', riskRes);
    logIfError('reports lookup', repRes);

    if (opRes.error || riskRes.error || repRes.error) {
      offline = true;
    } else if (opRes.data) {
      data = {
        op: opRes.data,
        risk: riskRes.data || { base_risk: 'yellow', confirmed_reports: 0, pending_reports: 0 },
        reps: repRes.data || []
      };
    }
  } catch (e) {
    console.log('DB offline, using fallback:', e.message);
    offline = true;
  }

  if (offline) data = OFFLINE[code] || null;

  if (!data) return `⚠️ WARNING: Code ${code} NOT FOUND in registry.\nDo NOT board.`;

  const reply = formatVerify(data);
  return offline ? `${reply}\n(offline demo data)` : reply;
}

// ---------- check (driver checks a customer) ----------
function isNightTrip(text) {
  if (/night|usiku/i.test(text)) return true;
  const m = text.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)/i);
  if (!m) return false;
  let h = parseInt(m[1], 10) % 12;
  if (m[2].toLowerCase() === 'pm') h += 12;
  return h >= 21 || h < 5;
}

async function handleCheck(text, tokens) {
  const customerCode = (tokens[1] || '').toUpperCase();
  if (!customerCode) return 'Type: check C-8891 to Manja 11pm';

  const toMatch = text.match(/\sto\s+(.+)$/i);
  const destination = toMatch ? toMatch[1].trim() : null;

  let known = true;
  try {
    const r = await supabase.from('customers').select('code').eq('code', customerCode).maybeSingle();
    logIfError('customer lookup', r);
    if (!r.error && !r.data) known = false;
  } catch (e) {
    console.log('customer lookup error:', e.message);
  }

  const reasons = [];
  if (!known) reasons.push('customer not registered');
  if (isNightTrip(text)) reasons.push('night trip');
  const level = reasons.length ? 'MEDIUM' : 'LOW';
  const reasonText = reasons.length ? reasons.join(', ') : 'no risk signals';

  logIfError('trip insert', await supabase.from('trips').insert({
    operator_code: 'demo',
    customer_code: customerCode,
    to_location: destination || text,
    status: 'logged',
    checked_by: 'driver',
    risk_level: level === 'LOW' ? 'green' : 'yellow',
    risk_reason: reasonText
  }));

  return `👤 Customer ${customerCode} checked. Trip logged.\n🧮 Risk (demo rules): ${level} (${reasonText}).\nShare your live trip with someone you trust and stay on the main road.\nChenjerani, gawanani ulendo.`;
}

// ---------- SOS ----------
async function handleSos(text, phone) {
  const language = /ndithandizeni|mavuto|thandizo/i.test(text) ? 'ny' : 'en';
  logIfError('sos insert', await supabase.from('sos_alerts').insert({
    sender_phone: phone,
    transcript: text,
    urgency: 'HIGH',
    language
  }));
  return `🆘 SOS RECEIVED!\nAlert sent to trusted contacts + nearby riders.\nThandizo likubwera. Stay on main road.\n(Demo: no real alerts are sent yet.)`;
}

// ---------- report ----------
async function handleReport(text, tokens, phone) {
  const code = (tokens[1] || '').toUpperCase();
  if (!code) return 'Type: report KBA-9999 robbery Ndirande';

  const typeWord = (tokens[2] || '').toLowerCase();
  const knownType = REPORT_TYPES.includes(typeWord);
  const type = knownType ? typeWord : 'other';
  const location = tokens.slice(knownType ? 3 : 2).join(' ') || null;

  const [o, c] = await Promise.all([
    supabase.from('operators').select('code').eq('code', code).maybeSingle(),
    supabase.from('customers').select('code').eq('code', code).maybeSingle()
  ]);
  if (!o.data && !c.data) return `Code ${code} was not found, so the report was not saved.`;

  const { error } = await supabase.from('reports').insert({
    reported_code: code,
    reporter_phone: phone,
    type,
    description: text,
    location
  });

  if (error) {
    if (error.code === '23505') return `You have already reported ${code} for ${type}. Thank you.`;
    console.log('report insert failed:', error.message);
    return 'Sorry, your report could not be saved. Please try again.';
  }
  return `Thank you. Your report on ${code} was saved for review.\nReports are checked before they change a rating.\nZikomo poteteza ena.`;
}

// ---------- breakdown ----------
async function handleBreakdown(text) {
  const m = text.match(/near\s+([a-z]+\s*\d*)/i);
  const area = m ? m[1].trim() : null;

  let query = supabase
    .from('helpers')
    .select('kind, name, phone, area, price_note')
    .eq('opted_in', true);
  if (area) query = query.ilike('area', `%${area}%`);

  const { data, error } = await query.limit(10);
  logIfError('helpers lookup', { error });

  if (error || !data || data.length === 0) {
    return `🛠️ Breakdown request received.\nNo listed help for ${area || 'that area'} yet.\nStay in a safe, well-lit place and ask someone nearby to help you reach the nearest police.`;
  }

  const order = ['mechanic', 'towing', 'fuel', 'police', 'clinic'];
  data.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const lines = data.slice(0, 5).map((h, i) => {
    const extra = [h.area, h.price_note].filter(Boolean).join(', ');
    return `${i + 1}. ${h.name}${h.phone ? ' - ' + h.phone : ''}${extra ? ' (' + extra + ')' : ''}`;
  });

  return `🛠️ Breakdown request received.\nNearest help${area ? ' in ' + area : ''}:\n${lines.join('\n')}\nCall now for rescue.`;
}

// --- DEMO API for browser - NO META NEEDED ---
app.post('/api/chat', async (req, res) => {
  const text = (req.body.text || '').trim();
  const lower = text.toLowerCase();
  const tokens = text.split(/\s+/);
  const phone = req.body.phone || 'demo';
  let reply;

  try {
    if (lower.startsWith('verify')) {
      reply = await handleVerify(tokens);
    } else if (lower.startsWith('check')) {
      reply = await handleCheck(text, tokens);
    } else if (lower.startsWith('breakdown')) {
      reply = await handleBreakdown(text);
    } else if (lower.startsWith('report')) {
      reply = await handleReport(text, tokens, phone);
    } else if (lower.includes('sos') || lower.includes('mavuto') || lower.includes('ndithandizeni')) {
      reply = await handleSos(text, phone);
    } else {
      reply = `🦺 Ulendo Safe\n1. verify KBA-4521\n2. check C-8891 to Manja\n3. SOS\n4. breakdown near Area 25\n5. report KBA-9999 robbery Ndirande`;
    }
  } catch (e) {
    console.log(e);
    reply = '⚠️ Something went wrong on our side. Please try again.';
  }

  res.json({ reply });
});

// --- Safe Meta webhook (won't crash when Meta is locked) ---
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    return res.send(req.query['hub.challenge']);
  }
  res.send('Ulendo Safe webhook ready');
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  // We ignore Meta for now, demo uses /api/chat
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ulendo Safe server running on http://localhost:${PORT}`));