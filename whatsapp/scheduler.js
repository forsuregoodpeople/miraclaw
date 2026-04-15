"use strict";
const cron = require("node-cron");
const { query } = require("./db");
const sessions = require("./sessions");
const config = require("./config");

/**
 * Load message templates for a mitra from wa_settings.
 * Falls back to default Indonesian templates.
 */
async function getTemplates(mitraId) {
  const { rows } = await query(
    `SELECT key, value FROM wa_settings WHERE mitra_id=$1 AND key LIKE 'template_%'`,
    [mitraId]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    "H-3":    map["template_H-3"]    || "Halo {name}, tagihan bulan {period} sebesar Rp{amount} jatuh tempo 3 hari lagi ({due_date}). Mohon segera melakukan pembayaran.",
    "H-1":    map["template_H-1"]    || "Halo {name}, tagihan bulan {period} sebesar Rp{amount} jatuh tempo BESOK ({due_date}). Segera bayar untuk menghindari pemutusan layanan.",
    "H0":     map["template_H0"]     || "Halo {name}, tagihan bulan {period} sebesar Rp{amount} JATUH TEMPO HARI INI. Hubungi kami jika sudah membayar.",
    "OVERDUE":map["template_OVERDUE"]|| "Halo {name}, tagihan bulan {period} sebesar Rp{amount} SUDAH LEWAT JATUH TEMPO. Segera lunasi agar layanan tidak diputus.",
  };
}

/**
 * Build a message by substituting template variables.
 */
function buildMessage(template, vars) {
  return template
    .replace(/{name}/g,     vars.name     || "")
    .replace(/{period}/g,   vars.period   || "")
    .replace(/{amount}/g,   vars.amount   || "")
    .replace(/{due_date}/g, vars.due_date || "");
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Run a single scheduler tick:
 * For each mitra with a connected session, enqueue billing reminders.
 */
async function tick() {
  console.log("[scheduler] Running billing reminder tick");

  // Only process mitras with connected sessions
  const { rows: mitraRows } = await query(
    `SELECT mitra_id FROM wa_sessions WHERE status='connected'`
  );

  const today = new Date();
  const triggers = [
    { type: "H-3", date: new Date(today.getTime() + 3 * 86400000) },
    { type: "H-1", date: new Date(today.getTime() + 1 * 86400000) },
    { type: "H0",  date: today },
  ];

  for (const { mitra_id: mitraId } of mitraRows) {
    const templates = await getTemplates(mitraId);

    // H-3, H-1, H0
    for (const { type, date } of triggers) {
      const dateStr = fmtDate(date);
      const { rows: invoices } = await query(
        `SELECT
           i.id          AS invoice_id,
           c.id          AS customer_id,
           c.wa_number,
           c.name        AS customer_name,
           i.amount_due,
           i.billing_period,
           i.due_date
         FROM finance_invoices i
         JOIN customers c ON c.id = i.customer_id
         JOIN mikrotik_routers r ON r.id = c.router_id
         WHERE r.mitra_id = $1
           AND i.status = 'UNPAID'
           AND DATE(i.due_date) = $2
           AND c.wa_number IS NOT NULL
           AND c.wa_number <> ''`,
        [mitraId, dateStr]
      );

      for (const inv of invoices) {
        const message = buildMessage(templates[type], {
          name:     inv.customer_name,
          period:   inv.billing_period,
          amount:   Number(inv.amount_due).toLocaleString("id-ID"),
          due_date: dateStr,
        });
        await query(
          `INSERT INTO wa_queue
             (mitra_id, customer_id, invoice_id, wa_number, message, trigger_type, scheduled_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT DO NOTHING`,
          [mitraId, inv.customer_id, inv.invoice_id, inv.wa_number, message, type]
        ).catch(() => {});
      }
    }

    // OVERDUE
    const { rows: overdueInvoices } = await query(
      `SELECT
         i.id          AS invoice_id,
         c.id          AS customer_id,
         c.wa_number,
         c.name        AS customer_name,
         i.amount_due,
         i.billing_period,
         i.due_date
       FROM finance_invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN mikrotik_routers r ON r.id = c.router_id
       WHERE r.mitra_id = $1
         AND i.status = 'UNPAID'
         AND DATE(i.due_date) < CURRENT_DATE
         AND c.wa_number IS NOT NULL
         AND c.wa_number <> ''`,
      [mitraId]
    );

    for (const inv of overdueInvoices) {
      const dueStr = fmtDate(new Date(inv.due_date));
      const message = buildMessage(templates["OVERDUE"], {
        name:     inv.customer_name,
        period:   inv.billing_period,
        amount:   Number(inv.amount_due).toLocaleString("id-ID"),
        due_date: dueStr,
      });
      await query(
        `INSERT INTO wa_queue
           (mitra_id, customer_id, invoice_id, wa_number, message, trigger_type, scheduled_at)
         VALUES ($1,$2,$3,$4,$5,'OVERDUE',NOW())
         ON CONFLICT DO NOTHING`,
        [mitraId, inv.customer_id, inv.invoice_id, inv.wa_number, message]
      ).catch(() => {});
    }
  }

  console.log("[scheduler] Tick complete");
}

/**
 * Start the billing reminder cron job.
 * Fires every hour by default (configurable via SCHEDULER_INTERVAL_MINUTES).
 */
function start() {
  const minutes = config.SCHEDULER_INTERVAL_MINUTES;
  // node-cron expression: run every N minutes
  const cronExpr = `*/${minutes} * * * *`;
  console.log(`[scheduler] Starting billing reminders (every ${minutes} min)`);
  cron.schedule(cronExpr, () => {
    tick().catch((err) => console.error("[scheduler] Tick error:", err.message));
  });
  // Run immediately on startup too
  tick().catch((err) => console.error("[scheduler] Initial tick error:", err.message));
}

module.exports = { start, tick };
