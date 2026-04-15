"use strict";
require("dotenv").config();

const WA_SECRET = process.env.WA_SECRET || "";
if (!WA_SECRET && process.env.NODE_ENV === "production") {
  console.error("[config] FATAL: WA_SECRET is required in production");
  process.exit(1);
}

module.exports = {
  PORT: parseInt(process.env.PORT || "3004", 10),
  DB_URL: process.env.DB_URL || "postgres://postgres:password@localhost:5432/net_monitoring",
  WA_SECRET,
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001").split(","),
  AUTH_DATA_DIR: process.env.AUTH_DATA_DIR || "./wa_auth_data",
  SCHEDULER_INTERVAL_MINUTES: parseInt(process.env.SCHEDULER_INTERVAL_MINUTES || "60", 10),
  DEFAULT_SEND_DELAY_MS: parseInt(process.env.DEFAULT_SEND_DELAY_MS || "12000", 10),
};
