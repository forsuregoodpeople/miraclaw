"use strict";
const { query } = require("./db");
const sessions = require("./sessions");
const config = require("./config");

// Track which mitras have an active worker loop
const activeWorkers = new Set();

/**
 * Load rate-limit settings for a mitra from wa_settings.
 * Returns delay in ms between sends.
 */
async function getSendDelay(mitraId) {
  const { rows } = await query(
    `SELECT key, value FROM wa_settings WHERE mitra_id=$1 AND key IN ('base_delay_seconds','jitter_seconds')`,
    [mitraId]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, parseInt(r.value, 10) || 0]));
  const base = (map["base_delay_seconds"] || 12) * 1000;
  const jitter = (map["jitter_seconds"] || 5) * 1000;
  return base + Math.floor(Math.random() * jitter);
}

/**
 * Pop and send the next pending message for a mitra.
 * Returns true if a message was processed, false if queue is empty.
 */
async function processNext(mitraId) {
  // Use a transaction to avoid double-processing
  const client = await require("./db").pool.connect();
  let item = null;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, wa_number, message FROM wa_queue
       WHERE mitra_id=$1 AND status='pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [mitraId]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    item = rows[0];
    // Mark as in-flight to prevent retry race
    await client.query(
      `UPDATE wa_queue SET status='sending' WHERE id=$1`,
      [item.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  try {
    await sessions.sendMessage(mitraId, item.wa_number, item.message);
    await query(
      `UPDATE wa_queue SET status='sent', sent_at=NOW() WHERE id=$1`,
      [item.id]
    );
    console.log(`[worker] Sent to ${item.wa_number} (mitra ${mitraId}, queue id ${item.id})`);
  } catch (err) {
    console.error(`[worker] Failed mitra ${mitraId} queue ${item.id}:`, err.message);
    await query(
      `UPDATE wa_queue SET status='failed', error_msg=$1, retry_count=retry_count+1 WHERE id=$2`,
      [err.message.slice(0, 500), item.id]
    );
  }
  return true;
}

/**
 * Start a background send loop for a mitra.
 * Idempotent — calling twice for the same mitra is a no-op.
 */
async function startWorker(mitraId) {
  if (activeWorkers.has(mitraId)) return;
  activeWorkers.add(mitraId);
  console.log(`[worker] Starting loop for mitra ${mitraId}`);

  const loop = async () => {
    while (activeWorkers.has(mitraId)) {
      try {
        const hadMessage = await processNext(mitraId);
        if (hadMessage) {
          const delay = await getSendDelay(mitraId);
          await sleep(delay);
        } else {
          // No pending messages — poll every 5 seconds
          await sleep(5000);
        }
      } catch (err) {
        console.error(`[worker] Loop error mitra ${mitraId}:`, err.message);
        await sleep(10000);
      }
    }
    console.log(`[worker] Loop stopped for mitra ${mitraId}`);
  };

  loop();
}

function stopWorker(mitraId) {
  activeWorkers.delete(mitraId);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { startWorker, stopWorker };
