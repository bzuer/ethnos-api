const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const { logger } = require('./middleware/errorHandler');

const app = require('./app');

const keyPath = path.join(__dirname, '../ssl/ethnos-api-key.pem');
const certPath = path.join(__dirname, '../ssl/ethnos-api-cert.pem');

let sslOptions = null;
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
} else if (process.env.ENABLE_HTTPS === 'true') {
  logger.warn('HTTPS requested but certificate files were not found; falling back to HTTP only', {
    keyPath,
    certPath
  });
}

const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HTTP_PORT = process.env.PORT || ((process.env.NODE_ENV || '').toLowerCase() === 'test' ? 3000 : 1212);
const BIND_HOST = process.env.API_BIND_HOST || '127.0.0.1';

let httpsServer = null;

if (process.env.ENABLE_HTTPS === 'true' && sslOptions) {
  httpsServer = https.createServer(sslOptions, app);

  app.listen(HTTP_PORT, BIND_HOST, () => {
    logger.info(`HTTP server running on ${BIND_HOST}:${HTTP_PORT}`);
  });

  httpsServer.listen(HTTPS_PORT, BIND_HOST, () => {
    logger.info(`HTTPS server running on ${BIND_HOST}:${HTTPS_PORT}`);
  });
} else {
  app.listen(HTTP_PORT, BIND_HOST, () => {
    logger.info(`HTTP server running on ${BIND_HOST}:${HTTP_PORT}`);
  });
}

module.exports = { app, httpsServer };
