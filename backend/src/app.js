const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const pkg = require('../package.json');
const authRoutes = require('./routes/auth');
const cargoRoutes = require('./routes/cargo');
const driverRoutes = require('./routes/driver');
const matchingRoutes = require('./routes/matching');
const offerRoutes = require('./routes/offers');
const shipmentRoutes = require('./routes/shipments');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');

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
  app.use('/api/settings', settingsRoutes);

  app.use('/api/cargo', cargoRoutes);

  app.use('/api/driver', driverRoutes);

  app.use('/api/matching', matchingRoutes);

  app.use('/api/offers', offerRoutes);

  app.use('/api/shipments', shipmentRoutes);

  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

module.exports = { createApp };
