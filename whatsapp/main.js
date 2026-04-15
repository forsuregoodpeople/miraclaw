"use strict";
const express = require("express");
const QRCode  = require("qrcode");
const config  = require("./config");
const { query } = require("./db");
const sessions = require("./sessions");
const worker   = require("./worker");
const scheduler = require("./scheduler");

const app = express();
app.use(express.json());

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Auth middleware ────────────────────────────────────────────────────────────
let _authWarned = false;
function auth(req, res, next) {
  if (!config.WA_SECRET) {
    if (!_authWarned) {
      console.warn("[auth] WARNING: WA_SECRET not set — auth disabled (dev mode only)");
      _authWarned = true;
    }
    return next();
  }
  const header = req.headers["authorization"] || "";
  if (header !== `Bearer ${config.WA_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ── Health ─────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Sessions ───────────────────────────────────────────────────────────────────

// GET /api/sessions  — list all sessions with live status
app.get("/api/sessions", auth, async (_req, res) => {
  try {
    const list = await sessions.listSessions();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:mitraId  — create / restart a session
app.post("/api/sessions/:mitraId", auth, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  if (!mitraId) return res.status(400).json({ error: "invalid mitraId" });
  try {
    await sessions.initSession(mitraId);
    res.json({ message: "session initializing", mitra_id: mitraId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:mitraId/status  — live status
app.get("/api/sessions/:mitraId/status", auth, (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  res.json({ mitra_id: mitraId, status: sessions.getStatus(mitraId) });
});

// GET /api/sessions/:mitraId/qr  — get QR as base64 PNG
app.get("/api/sessions/:mitraId/qr", auth, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  const qrString = sessions.getQR(mitraId);
  if (!qrString) {
    return res.status(404).json({ error: "no QR available", status: sessions.getStatus(mitraId) });
  }
  try {
    const dataUrl = await QRCode.toDataURL(qrString);
    res.json({ qr: dataUrl, mitra_id: mitraId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:mitraId  — logout
app.delete("/api/sessions/:mitraId", auth, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  try {
    worker.stopWorker(mitraId);
    await sessions.logout(mitraId);
    res.json({ message: "session logged out" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send ───────────────────────────────────────────────────────────────────────

// POST /api/send  { mitra_id, wa_number, message }
app.post("/api/send", auth, async (req, res) => {
  const { mitra_id, wa_number, message } = req.body;
  if (!mitra_id || !wa_number || !message) {
    return res.status(400).json({ error: "mitra_id, wa_number and message are required" });
  }
  try {
    await sessions.sendMessage(mitra_id, wa_number, message);
    res.json({ message: "sent" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Queue ──────────────────────────────────────────────────────────────────────

// GET /api/queue?mitra_id=&status=&limit=&offset=
app.get("/api/queue", auth, async (req, res) => {
  const mitraId = req.query.mitra_id ? parseInt(req.query.mitra_id, 10) : null;
  const status  = req.query.status  || null;
  const limit   = parseInt(req.query.limit  || "50", 10);
  const offset  = parseInt(req.query.offset || "0",  10);

  const conditions = [];
  const params = [];
  if (mitraId) { params.push(mitraId); conditions.push(`mitra_id=$${params.length}`); }
  if (status)  { params.push(status);  conditions.push(`status=$${params.length}`); }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  params.push(limit, offset);
  try {
    const { rows } = await query(
      `SELECT id, mitra_id, customer_id, invoice_id, wa_number, message,
              trigger_type, status, retry_count, scheduled_at, sent_at, error_msg, created_at
       FROM wa_queue ${where}
       ORDER BY scheduled_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/:id/retry  — reset failed item to pending
app.post("/api/queue/:id/retry", auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await query(
      `UPDATE wa_queue SET status='pending', error_msg=NULL, scheduled_at=NOW() WHERE id=$1`,
      [id]
    );
    res.json({ message: "queued for retry" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue  — manual enqueue
app.post("/api/queue", auth, async (req, res) => {
  const { mitra_id, wa_number, message, customer_id, invoice_id } = req.body;
  if (!mitra_id || !wa_number || !message) {
    return res.status(400).json({ error: "mitra_id, wa_number and message are required" });
  }
  try {
    const { rows } = await query(
      `INSERT INTO wa_queue (mitra_id, customer_id, invoice_id, wa_number, message, trigger_type)
       VALUES ($1,$2,$3,$4,$5,'MANUAL')
       RETURNING *`,
      [mitra_id, customer_id || null, invoice_id || null, wa_number, message]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Settings ───────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  enabled: "false",
  rate_limit_per_min: "5",
  base_delay_seconds: "12",
  jitter_seconds: "5",
  max_retry: "3",
  stop_on_fail_count: "10",
  "template_H-3":     "Halo {name}, tagihan bulan {period} sebesar Rp{amount} jatuh tempo 3 hari lagi ({due_date}). Mohon segera melakukan pembayaran.",
  "template_H-1":     "Halo {name}, tagihan bulan {period} sebesar Rp{amount} jatuh tempo BESOK ({due_date}). Segera bayar untuk menghindari pemutusan layanan.",
  "template_H0":      "Halo {name}, tagihan bulan {period} sebesar Rp{amount} JATUH TEMPO HARI INI. Hubungi kami jika sudah membayar.",
  "template_OVERDUE": "Halo {name}, tagihan bulan {period} sebesar Rp{amount} SUDAH LEWAT JATUH TEMPO. Segera lunasi agar layanan tidak diputus.",
};

function rowsToSettings(rows) {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const s = { ...DEFAULT_SETTINGS, ...map };
  return {
    enabled:            s.enabled === "true",
    rate_limit_per_min: parseInt(s.rate_limit_per_min, 10),
    base_delay_seconds: parseInt(s.base_delay_seconds, 10),
    jitter_seconds:     parseInt(s.jitter_seconds, 10),
    max_retry:          parseInt(s.max_retry, 10),
    stop_on_fail_count: parseInt(s.stop_on_fail_count, 10),
    templates: {
      "H-3":    s["template_H-3"],
      "H-1":    s["template_H-1"],
      "H0":     s["template_H0"],
      "OVERDUE":s["template_OVERDUE"],
    },
  };
}

// GET /api/settings/:mitraId
app.get("/api/settings/:mitraId", auth, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  try {
    const { rows } = await query(`SELECT key, value FROM wa_settings WHERE mitra_id=$1`, [mitraId]);
    res.json({ data: rowsToSettings(rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:mitraId  { enabled, rate_limit_per_min, base_delay_seconds, jitter_seconds, max_retry, stop_on_fail_count, templates }
app.put("/api/settings/:mitraId", auth, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId, 10);
  const body = req.body;

  const kvPairs = [];
  if (body.enabled           !== undefined) kvPairs.push(["enabled",            String(body.enabled)]);
  if (body.rate_limit_per_min !== undefined) kvPairs.push(["rate_limit_per_min", String(body.rate_limit_per_min)]);
  if (body.base_delay_seconds !== undefined) kvPairs.push(["base_delay_seconds", String(body.base_delay_seconds)]);
  if (body.jitter_seconds    !== undefined) kvPairs.push(["jitter_seconds",     String(body.jitter_seconds)]);
  if (body.max_retry         !== undefined) kvPairs.push(["max_retry",          String(body.max_retry)]);
  if (body.stop_on_fail_count !== undefined) kvPairs.push(["stop_on_fail_count", String(body.stop_on_fail_count)]);
  if (body.templates) {
    for (const [k, v] of Object.entries(body.templates)) {
      kvPairs.push([`template_${k}`, v]);
    }
  }

  try {
    for (const [k, v] of kvPairs) {
      await query(
        `INSERT INTO wa_settings (mitra_id, key, value, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (mitra_id, key) DO UPDATE SET value=$3, updated_at=NOW()`,
        [mitraId, k, v]
      );
    }
    const { rows } = await query(`SELECT key, value FROM wa_settings WHERE mitra_id=$1`, [mitraId]);
    res.json({ data: rowsToSettings(rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Startup ────────────────────────────────────────────────────────────────────


async function main() {
  console.log("[main] Starting WA service...");

  // Patch sessions to call worker.startWorker on any ready event
  // sessions.js already calls onReadyCallbacks.get(mitraId) — we register per-session
  // To make it global we pre-register for all DB sessions + re-register when new ones are added
  // Simpler: sessions.js exports onReady(mitraId, cb) — we wrap initSession to also register
  const origInit = sessions.initSession.bind(sessions);
  sessions.initSession = async (mitraId) => {
    await origInit(mitraId);
    sessions.onReady(mitraId, () => worker.startWorker(mitraId));
  };

  await sessions.loadAllFromDB();
  scheduler.start();

  app.listen(config.PORT, () => {
    console.log(`[main] WA service listening on port ${config.PORT}`);
  });
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
