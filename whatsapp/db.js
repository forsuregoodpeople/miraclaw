"use strict";
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.DB_URL });

pool.on("error", (err) => {
  console.error("[db] Unexpected PostgreSQL error:", err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text
 * @param {any[]} [params]
 */
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { pool, query };
