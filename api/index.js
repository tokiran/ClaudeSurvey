require('dotenv').config();
const { init } = require('../src/db');
const app = require('../app');

// init() is idempotent (CREATE TABLE IF NOT EXISTS).
// Cache the promise so subsequent requests on a warm instance skip it.
const ready = init();

module.exports = async (req, res) => {
  await ready;
  app(req, res);
};
