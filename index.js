/**
 * Decopol amoCRM Proxy (Node.js, Render.com uchun)
 *
 * Eski PHP fayl (amo_proxy.php) hosting tarmoq cheklovi tufayli amoCRM
 * bilan ishonchli ulana olmay qoldi. Bu server xuddi shu 5 ta action'ni
 * (dashboard ishlatadigan) Node.js orqali qayta amalga oshiradi.
 */

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// CORS - dashboard saytidan so'rov kelishi uchun
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ───────────────────────────────────────────────
// SOZLAMALAR (Render.com Environment Variables orqali)
// ───────────────────────────────────────────────
const AMO_TOKEN = process.env.AMO_TOKEN || '';
const AMO_SUBDOMAIN = process.env.AMO_SUBDOMAIN || 'decopoluzz';
const AMO_BASE = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4`;

const CC_PIPELINE_ID = 10645450;
const SHOWROOM_PIPELINE_ID = 10645466;
const SHOWROOM_KELDI_STATUS_ID = 83911974;
const USPESHNO_STATUS_ID = 142;
const BEKOR_STATUS_ID = 143;
const VISIT_DATE_FIELD_ID = 2031617;
const OPERATOR_FIELD_ID = 2037113;
const FARGONA_LOSS_REASON_ID = 23218834;
const UZS_TO_USD = 12000;

const ENUM_MAP = {
  1241791: 'shirina',
  1249273: 'shahina',
  1249275: 'lola',
  1249277: 'asadbek',
};

const STATUS_MAP = {
  yangi_lid: 83911906,
  kotarmadi: 85239834,
  malumot: 83911910,
  uchrashuv: 84385754,
  uspeshno: 142,
  bekor: 143,
};

// ───────────────────────────────────────────────
// amoCRM'ga so'rov yuborish
// ───────────────────────────────────────────────
async function amoRequest(method, path) {
  try {
    const res = await fetch(`${AMO_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${AMO_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
    const httpCode = res.status;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    return { httpCode, data };
  } catch (e) {
    return { httpCode: 0, error: e.message };
  }
}

async function fetchAllLeads(filterParams) {
  let page = 1;
  let allLeads = [];
  let batch;
  do {
    const filter = `${filterParams}&limit=250&page=${page}`;
    const r = await amoRequest('GET', `/leads?${filter}`);
    if (r.httpCode !== 200) break;
    batch = r.data?._embedded?.leads || [];
    allLeads = allLeads.concat(batch);
    page++;
  } while (batch.length === 250 && page < 20);
  return allLeads;
}

function dayOfMonth(unixTs) {
  const d = new Date(unixTs * 1000);
  // Asia/Tashkent (+5)
  const tashkent = new Date(d.getTime() + 5 * 60 * 60000);
  return tashkent.getUTCDate();
}

function getOperatorFieldValue(lead) {
  if (!lead.custom_fields_values) return null;
  for (const cf of lead.custom_fields_values) {
    if (cf.field_id === OPERATOR_FIELD_ID) {
      return cf.values?.[0]?.enum_id ?? null;
    }
  }
  return null;
}

function getCustomFieldValue(lead, fieldId) {
  if (!lead.custom_fields_values) return null;
  for (const cf of lead.custom_fields_values) {
    if (cf.field_id === fieldId) {
      return cf.values?.[0]?.value ?? null;
    }
  }
  return null;
}

function monthRange(fromParam, toParam) {
  const now = Math.floor(Date.now() / 1000);
  const from = fromParam ? parseInt(fromParam) : Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
  const to = toParam ? parseInt(toParam) : Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime() / 1000);
  return { from, to, now };
}

// ───────────────────────────────────────────────
// ACTIONS
// ───────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Decopol amoCRM Proxy', status: 'running' });
});

app.get('/ping', async (req, res) => {
  const r = await amoRequest('GET', '/account');
  res.json({ ok: r.httpCode === 200, http_code: r.httpCode, account: r.data?.name ?? null, error: r.error ?? null });
});

app.get('/cc_operator_total_leads', async (req, res) => {
  const { from, to } = monthRange(req.query.from, req.query.to);
  const leads = await fetchAllLeads(`filter[pipeline_id]=${CC_PIPELINE_ID}&filter[created_at][from]=${from}&filter[created_at][to]=${to}&with=custom_fields_values`);

  const totals = {};
  Object.values(ENUM_MAP).forEach((id) => (totals[id] = 0));
  let noaniq = 0;

  leads.forEach((lead) => {
    const enumId = getOperatorFieldValue(lead);
    const empId = enumId !== null ? ENUM_MAP[enumId] : undefined;
    if (empId) totals[empId]++;
    else noaniq++;
  });

  res.json({ ok: true, total_leads_checked: leads.length, totals, noaniq });
});

app.get('/cc_visit_count', async (req, res) => {
  const { from, to, now } = monthRange(req.query.from, req.query.to);
  const leads = await fetchAllLeads(
    `filter[pipeline_id]=${SHOWROOM_PIPELINE_ID}&filter[statuses][0][pipeline_id]=${SHOWROOM_PIPELINE_ID}&filter[statuses][0][status_id]=${SHOWROOM_KELDI_STATUS_ID}&with=custom_fields_values`
  );

  const byDay = {};
  Object.values(ENUM_MAP).forEach((id) => (byDay[id] = {}));
  let noaniq = 0;
  let totalMatched = 0;

  leads.forEach((lead) => {
    if (!lead.custom_fields_values) return;
    const visitTs = getCustomFieldValue(lead, VISIT_DATE_FIELD_ID);
    const enumId = getOperatorFieldValue(lead);
    if (visitTs === null) return;
    const visitTsInt = parseInt(visitTs);
    if (visitTsInt < from || visitTsInt > to) return;
    if (visitTsInt > now) return;

    totalMatched++;
    const day = dayOfMonth(visitTsInt);
    const empId = enumId !== null ? ENUM_MAP[enumId] : undefined;
    if (empId) {
      byDay[empId][day] = (byDay[empId][day] || 0) + 1;
    } else {
      noaniq++;
    }
  });

  const totals = {};
  Object.keys(byDay).forEach((empId) => {
    totals[empId] = Object.values(byDay[empId]).reduce((a, b) => a + b, 0);
  });

  res.json({ ok: true, total_uspeshno_leads: totalMatched, totals, by_day: byDay, noaniq });
});

app.get('/cc_status_counts', async (req, res) => {
  const from = req.query.from ? parseInt(req.query.from) : Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const to = req.query.to ? parseInt(req.query.to) : from + 86399;
  const leads = await fetchAllLeads(`filter[pipeline_id]=${CC_PIPELINE_ID}&filter[created_at][from]=${from}&filter[created_at][to]=${to}&with=tags`);

  const counts = {};
  Object.keys(STATUS_MAP).forEach((k) => (counts[k] = 0));
  let musor = 0,
    fargona = 0,
    reklama = 0,
    organic = 0;

  leads.forEach((lead) => {
    Object.entries(STATUS_MAP).forEach(([key, statusId]) => {
      if (lead.status_id === statusId) counts[key]++;
    });
    if (lead.status_id === BEKOR_STATUS_ID) {
      if (lead.loss_reason_id === FARGONA_LOSS_REASON_ID) fargona++;
      else musor++;
    }
    let isAd = false;
    const nm = lead.name || '';
    if (/^facebook/i.test(nm) || /^instagram/i.test(nm)) isAd = true;
    if (lead._embedded?.tags) {
      for (const t of lead._embedded.tags) {
        if (/^fb/i.test(t.name)) {
          isAd = true;
          break;
        }
      }
    }
    if (isAd) reklama++;
    else organic++;
  });

  const jamiLid = leads.length;
  const kval = jamiLid - musor;

  res.json({
    ok: true,
    total_leads_in_range: leads.length,
    total_created: leads.length,
    counts,
    musor,
    kval,
    fargona,
    reklama,
    organic,
  });
});

app.get('/cc_sales_amount', async (req, res) => {
  const { from, to } = monthRange(req.query.from, req.query.to);
  const leads = await fetchAllLeads(
    `filter[pipeline_id]=${SHOWROOM_PIPELINE_ID}&filter[statuses][0][pipeline_id]=${SHOWROOM_PIPELINE_ID}&filter[statuses][0][status_id]=${USPESHNO_STATUS_ID}&filter[closed_at][from]=${from}&filter[closed_at][to]=${to}&with=custom_fields_values`
  );

  const byDay = {};
  const totals = {};
  Object.values(ENUM_MAP).forEach((id) => {
    byDay[id] = {};
    totals[id] = 0;
  });

  leads.forEach((lead) => {
    const enumId = getOperatorFieldValue(lead);
    if (enumId === null || !ENUM_MAP[enumId]) return;
    const empId = ENUM_MAP[enumId];
    const priceUsd = Math.round(((lead.price || 0) / UZS_TO_USD) * 100) / 100;
    const day = lead.closed_at ? dayOfMonth(lead.closed_at) : new Date().getDate();
    byDay[empId][day] = (byDay[empId][day] || 0) + priceUsd;
    totals[empId] += priceUsd;
  });

  res.json({ ok: true, total_leads_checked: leads.length, totals, by_day: byDay });
});

app.get('/cc_daily_history', async (req, res) => {
  const { from, to } = monthRange(req.query.from, req.query.to);
  const leads = await fetchAllLeads(`filter[pipeline_id]=${CC_PIPELINE_ID}&filter[created_at][from]=${from}&filter[created_at][to]=${to}`);

  const byDay = {};
  leads.forEach((lead) => {
    const day = dayOfMonth(lead.created_at);
    if (!byDay[day]) {
      byDay[day] = { jami: 0, yangi_lid: 0, kotarmadi: 0, malumot: 0, uchrashuv: 0, uspeshno: 0, bekor: 0, musor: 0, kval: 0, call_count: 0 };
    }
    byDay[day].jami++;
    Object.entries(STATUS_MAP).forEach(([key, statusId]) => {
      if (lead.status_id === statusId) byDay[day][key]++;
    });
    if (lead.status_id === BEKOR_STATUS_ID) {
      if (lead.loss_reason_id !== FARGONA_LOSS_REASON_ID) byDay[day].musor++;
    }
  });
  Object.keys(byDay).forEach((day) => {
    byDay[day].kval = byDay[day].jami - byDay[day].musor;
  });

  res.json({ ok: true, total_leads: leads.length, by_day: byDay });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Decopol amoCRM Proxy ${PORT}-portda ishga tushdi`);
});
