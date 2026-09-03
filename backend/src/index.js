require('dotenv').config();
const { createApp } = require('./app');
const connectDB = require('./config/db');
const adminService = require('./services/adminService');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();
  try {
    await adminService.ensureAdminBootstrap();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`admin bootstrap failed: ${err.message}`);
  }
  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`baryar-api listening on ${PORT}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
