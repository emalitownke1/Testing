import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from 'url';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./db";
import "./services/enhanced-commands";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress noisy Signal protocol session logs
const originalLog = console.log;
const suppressedPatterns = [
  'Closing stale open session',
  'Closing session:',
  'SessionEntry',
  'ephemeralKeyPair',
  'registrationId',
  'remoteIdentityKey',
  'pendingPreKey',
  'prekey bundle'
];

console.log = function(...args: any[]) {
  const message = args.join(' ');
  const shouldSuppress = suppressedPatterns.some(pattern => message.includes(pattern));
  if (!shouldSuppress) {
    originalLog.apply(console, args);
  }
};

// Guard to prevent double-start of monitoring
let monitoringStarted = false;

// Start monitoring once with guard
async function startMonitoringOnce() {
  if (monitoringStarted) return;
  monitoringStarted = true;

  try {
    console.log('✅ Starting scheduled bot monitoring...');
    await startScheduledBotMonitoring();
  } catch (error) {
    console.error('❌ Failed to start monitoring:', error);
    console.error('Error details:', error);
    // Reset flag so monitoring can be retried
    monitoringStarted = false;
  }
}

// Scheduled bot monitoring function
async function startScheduledBotMonitoring() {
  try {
    const { storage } = await import('./storage');
    const { botManager } = await import('./services/bot-manager');

    const checkApprovedBots = async () => {
      try {
        const approvedBots = await storage.getApprovedBots();
        if (!approvedBots || approvedBots.length === 0) return;

        console.log(`🔍 Checking ${approvedBots.length} approved bot(s)...`);

        // Start all offline approved bots concurrently
        await Promise.all(
          approvedBots.map(bot => botManager.startBot(bot.id))
        );
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    };

    // Check immediately then every 3 minutes
    setImmediate(checkApprovedBots);
    setInterval(checkApprovedBots, 180000);

    // Server heartbeat - update lastActive every 30 minutes
    const updateServerHeartbeat = async () => {
      try {
        await storage.updateServerHeartbeat();
        console.log('💓 Server heartbeat updated');
      } catch (error) {
        console.error('❌ Failed to update server heartbeat:', error);
      }
    };

    // Initial heartbeat update after 30 seconds (non-blocking)
    setTimeout(updateServerHeartbeat, 30000);

    // Schedule heartbeat updates every 30 minutes (1800000ms)
    setInterval(updateServerHeartbeat, 1800000);

  } catch (error) {
    console.error('❌ Failed to start scheduled bot monitoring:', error);
  }
}

const app = express();
app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ extended: false, limit: '7mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    // Skip logging HEAD requests to /api (health checks) and other non-meaningful requests
    if (path.startsWith("/api") && !(req.method === "HEAD" && path === "/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {

  // Initialize database (create tables if they don't exist)
  await initializeDatabase();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Setup vite for development
  await setupVite(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    // Delay monitoring startup by 10 seconds to ensure DB is fully ready
    console.log('🚀 Scheduled monitoring system will start in 10 seconds...');
    setTimeout(() => {
      startMonitoringOnce().catch(error => {
        console.error('❌ Failed to start monitoring:', error);
        console.error('Stack trace:', error.stack);
        // Don't crash the server - just log the error
      });
    }, 10000);
  });

  // Global error handlers to prevent crashes
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception - Server continues running:', error);
    console.error('Stack trace:', error.stack);
    // Log but don't crash - let server continue
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Promise Rejection - Server continues running:', reason);
    console.error('Promise:', promise);
    // Log but don't crash - let server continue
  });

  // Graceful shutdown handling for containerized environments
  const gracefulShutdown = (signal: string) => {
    log(`${signal} received, shutting down gracefully`);
    server.close((err: Error | undefined) => {
      if (err) {
        log(`Error during server shutdown: ${err.message}`);
        process.exit(1);
      }
      log('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      log('Force shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

})().catch(error => {
  console.error('❌ Failed to start server:', error);
  console.error('🔄 Attempting server restart in 5 seconds...');

  // Attempt to restart the server instead of exiting
  setTimeout(() => {
    console.log('🔄 Restarting server...');
    // Re-import and restart
    import('./index.ts').catch(restartError => {
      console.error('❌ Server restart failed:', restartError);
      process.exit(1);
    });
  }, 5000);
});