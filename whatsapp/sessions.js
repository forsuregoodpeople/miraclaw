"use strict";
const { Client, LocalAuth } = require("whatsapp-web.js");
const config = require("./config");
const { query } = require("./db");

// In-memory state per mitra
// mitraId (number) → { client: Client, qr: string|null, status: string }
const sessions = new Map();

// Callbacks registered by worker.js to start processing when session is ready
const onReadyCallbacks = new Map();

/**
 * Register a callback to invoke when a session becomes ready.
 * worker.js uses this to start the per-mitra send loop.
 */
function onReady(mitraId, cb) {
  onReadyCallbacks.set(mitraId, cb);
}

/**
 * Initialize (or reinitialize) a WhatsApp session for a mitra.
 * Creates a whatsapp-web.js Client with LocalAuth so sessions survive restarts.
 */
async function initSession(mitraId) {
  // Destroy existing client if any
  if (sessions.has(mitraId)) {
    try { await sessions.get(mitraId).client.destroy(); } catch (_) {}
    sessions.delete(mitraId);
  }

  const authDataPath = `${config.AUTH_DATA_DIR}/mitra_${mitraId}`;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `mitra_${mitraId}`,
      dataPath: config.AUTH_DATA_DIR,
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
      ],
    },
  });

  const entry = { client, qr: null, status: "connecting" };
  sessions.set(mitraId, entry);

  // Do NOT insert to DB yet — only save after QR is scanned and session is ready

  client.on("qr", (qr) => {
    console.log(`[sessions] QR generated for mitra ${mitraId}`);
    entry.qr = qr;
    entry.status = "connecting";
    // No DB write yet — session not confirmed
  });

  client.on("authenticated", () => {
    console.log(`[sessions] Authenticated for mitra ${mitraId}`);
    entry.qr = null;
  });

  client.on("ready", () => {
    console.log(`[sessions] Ready for mitra ${mitraId}`);
    entry.qr = null;
    entry.status = "connected";
    // Only now persist to DB — scan was successful
    query(
      `INSERT INTO wa_sessions (mitra_id, status, auth_data_path, created_at, updated_at)
       VALUES ($1, 'connected', $2, NOW(), NOW())
       ON CONFLICT (mitra_id) DO UPDATE
         SET status='connected', auth_data_path=$2, last_seen_at=NOW(), updated_at=NOW()`,
      [mitraId, authDataPath]
    ).catch(() => {});
    // Trigger worker start
    const cb = onReadyCallbacks.get(mitraId);
    if (cb) cb(mitraId);
  });

  client.on("disconnected", (reason) => {
    console.log(`[sessions] Disconnected mitra ${mitraId}:`, reason);
    entry.qr = null;
    entry.status = "disconnected";
    // Update DB only if row exists (it was previously connected)
    query(
      `UPDATE wa_sessions SET status='disconnected', updated_at=NOW() WHERE mitra_id=$1`,
      [mitraId]
    ).catch(() => {});
  });

  client.on("auth_failure", (msg) => {
    console.error(`[sessions] Auth failure mitra ${mitraId}:`, msg);
    entry.status = "disconnected";
    query(
      `UPDATE wa_sessions SET status='disconnected', updated_at=NOW() WHERE mitra_id=$1`,
      [mitraId]
    ).catch(() => {});
  });

  await client.initialize();
}

/**
 * Get current in-memory QR string for a mitra (null if not in QR phase).
 */
function getQR(mitraId) {
  return sessions.get(mitraId)?.qr ?? null;
}

/**
 * Get in-memory status for a mitra.
 */
function getStatus(mitraId) {
  return sessions.get(mitraId)?.status ?? "disconnected";
}

/**
 * Send a WhatsApp message via the mitra's active session.
 * Throws if session not connected.
 */
async function sendMessage(mitraId, waNumber, message) {
  const entry = sessions.get(mitraId);
  if (!entry || entry.status !== "connected") {
    throw new Error(`Session for mitra ${mitraId} is not connected`);
  }
  // Normalize number: strip leading 0, add country code if needed
  let number = waNumber.replace(/\D/g, "");
  if (number.startsWith("0")) number = "62" + number.slice(1);
  await entry.client.sendMessage(`${number}@c.us`, message);
}

/**
 * Logout a mitra session: destroy client, update DB, remove from map.
 */
async function logout(mitraId) {
  const entry = sessions.get(mitraId);
  if (entry) {
    try { await entry.client.logout(); } catch (_) {}
    try { await entry.client.destroy(); } catch (_) {}
    sessions.delete(mitraId);
  }
  await query(`DELETE FROM wa_sessions WHERE mitra_id=$1`, [mitraId]);
}

/**
 * Load all sessions from DB on startup and reinitialize them.
 */
async function loadAllFromDB() {
  const { rows } = await query(`SELECT mitra_id FROM wa_sessions`);
  for (const row of rows) {
    console.log(`[sessions] Restoring session for mitra ${row.mitra_id}`);
    initSession(row.mitra_id).catch((err) => {
      console.error(`[sessions] Failed to init mitra ${row.mitra_id}:`, err.message);
    });
  }
}

/**
 * Return all sessions with their current in-memory status merged with DB rows.
 */
async function listSessions() {
  const { rows } = await query(
    `SELECT id, mitra_id, session_name, status, last_seen_at, created_at FROM wa_sessions ORDER BY mitra_id`
  );
  return rows.map((r) => ({
    ...r,
    status: getStatus(r.mitra_id),
  }));
}

module.exports = { initSession, getQR, getStatus, sendMessage, logout, loadAllFromDB, listSessions, onReady };
