const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const pkg = require('../package.json');
const authRoutes = require('./routes/auth');

function createApp() {
  const app = express();

  app.use(helmet());
  // Permissive CORS for local Expo + Vite. A later plan will lock origins
  // to an allowlist once auth cookies exist.
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (req, res) => {
    let mongo = 'disconnected';
    let healthy = false;
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        mongo = 'ok';
        healthy = true;
      }
    } catch {
      mongo = 'error';
    }

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'baryar-api',
      version: pkg.version,
      checks: { mongo },
    });
  });

  app.use('/api/auth', authRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

module.exports = { createApp };
