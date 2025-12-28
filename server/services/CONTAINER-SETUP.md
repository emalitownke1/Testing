# Bot Container System - Setup & Integration Guide

## Quick Start

The WhatsApp bot container system is now integrated into your application. Here's how to use it:

### 1. Enable Containers in Bot Manager

The `BotManager` automatically creates containers for each bot:

```typescript
// Existing code continues to work as-is
const bot = await botManager.startBot(botId);

// New: Access the container for advanced monitoring
const container = botManager.getBotContainer(botId);
```

### 2. Monitor Container Health

```typescript
// Get all container statuses
const allStatus = botManager.getContainerHealthStatus();
console.log(allStatus);
// Output:
// {
//   "bot-123": {
//     containerId: "server1:bot-123",
//     botStatus: "online",
//     containerState: "running",
//     isHealthy: true,
//     lastHeartbeat: "2025-12-28T10:30:00Z",
//     connectionAttempts: 0,
//     credsLastUpdated: "2025-12-28T10:00:00Z",
//     eventHistorySize: 45
//   }
// }
```

### 3. Listen to Container Events

```typescript
const container = botManager.getBotContainer(botId);

// Listen for credential updates
container.onContainerEvent('creds-update', (event) => {
  console.log('Credentials updated:', new Date(event.timestamp));
});

// Listen for connection changes
container.onContainerEvent('connection-update', (event) => {
  if (event.data.connection === 'open') {
    console.log('Bot connected!');
  } else if (event.data.connection === 'close') {
    console.log('Bot disconnected!');
  }
});

// Listen for any errors
container.onContainerEvent('error', (event) => {
  console.error(`Bot error: ${event.data.message}`);
});
```

### 4. Manage Credentials

```typescript
import { credentialsManager } from './services/credentials-manager';

const botInstance = await storage.getBotInstance(botId);

// Load credentials
const creds = await credentialsManager.loadCredentials(botInstance);

// Check if credentials are expired (90 days)
const isExpired = await credentialsManager.isCredentialExpired(botInstance);

// Get credential age
const ageMs = await credentialsManager.getCredentialAge(botInstance);
console.log(`Credentials are ${ageMs / 1000 / 60 / 60 / 24} days old`);

// Save new credentials (with automatic backup)
await credentialsManager.backupCredentials(botInstance);
await credentialsManager.saveCredentials(botInstance, newCreds);
```

## Key Implementation Details

### Per-Bot Directory Structure

Each bot now has isolated auth directories:
```
auth/
├── serverName/
│   ├── bot_{botId}/
│   │   ├── creds.json              # Baileys credentials
│   │   ├── creds.metadata.json     # Metadata (version, expiry, verification)
│   │   ├── creds.backup.*.json     # Automatic backups
│   │   └── [other Baileys files]
```

### Heartbeat System

- **Interval**: 30 seconds (configurable)
- **Monitors**: Connection state and activity
- **Auto-detects**: Stale connections
- **Auto-recovers**: Triggers reconnection with exponential backoff
- **Logs**: All heartbeat activity to console

### Event Listener System

Each container tracks these event types:

| Event Type | Triggered When | Example Data |
|-----------|---------------|--------------|
| `connection-update` | Connection state changes | `{ connection: 'open', qr: '...' }` |
| `message-upsert` | New messages arrive | `{ messages: [...], type: 'notify' }` |
| `creds-update` | Credentials are updated | `{ timestamp: Date.now() }` |
| `presence-update` | User presence changes | `{ id: '...' }` |
| `error` | Any bot error occurs | `{ message: '...', code: '...' }` |

### Event History

- **Retention**: Last 100 events per container
- **Includes**: Timestamps and full event data
- **Access**: `container.getEventHistory(limit)`
- **Use case**: Debugging, monitoring, audit trails

## Integration with Existing Code

The container system is **100% backward compatible**:

1. **All existing WhatsAppBot methods still work**
2. **BotManager API unchanged**
3. **Storage operations unchanged**
4. **New functionality is opt-in**

### Migration Checklist

- ✅ No breaking changes
- ✅ Containers auto-created with bots
- ✅ Credentials auto-managed
- ✅ Heartbeat runs transparently
- ✅ New monitoring APIs available

## API Endpoints (Add to routes.ts if needed)

```typescript
// Get container health status
GET /api/bots/containers/health
Response: { [botId]: { containerId, botStatus, isHealthy, ... } }

// Get container events
GET /api/bots/:botId/events?limit=20
Response: Array<{ type, data, timestamp }>

// Get credentials metadata
GET /api/bots/:botId/credentials/metadata
Response: { botId, phoneNumber, lastUpdated, verified, version }
```

## Monitoring & Debugging

### Check Container Health

```typescript
const status = botManager.getContainerHealthStatus();
Object.entries(status).forEach(([botId, info]) => {
  console.log(`${botId}: ${info.isHealthy ? '✅' : '❌'}`);
});
```

### View Event History

```typescript
const events = botManager.getContainerEventHistory(botId, 10);
events.forEach(event => {
  console.log(`[${new Date(event.timestamp).toISOString()}] ${event.type}`);
  console.log(JSON.stringify(event.data, null, 2));
});
```

### Check Credential Status

```typescript
const metadata = await credentialsManager.getCredentialMetadata(botInstance);
console.log(`Verified: ${metadata.verified}`);
console.log(`Last Updated: ${new Date(metadata.lastUpdated)}`);

const isExpired = await credentialsManager.isCredentialExpired(botInstance);
if (isExpired) {
  console.log('⚠️ Credentials are expired, re-authentication needed');
}
```

## Troubleshooting

### Container Not Healthy

1. Check container status: `container.getStatus()`
2. View event history: `container.getEventHistory(20)`
3. Check for recent errors: Look for `'error'` type events
4. Verify credentials: `credentialsManager.hasCredentials(botInstance)`

### Stale Connection

1. Container heartbeat will detect automatically
2. Check `lastHeartbeat` in status
3. Connection attempts will increase
4. Check reconnection logs in event history

### Credential Issues

1. Check age: `credentialsManager.getCredentialAge(botInstance)`
2. Check expiration: `credentialsManager.isCredentialExpired(botInstance)`
3. Check verification: `metadata.verified`
4. Backups automatically created before updates

## Performance Notes

- **Memory**: Event history limited to 100 entries per container (~50KB per container)
- **CPU**: Minimal - heartbeat runs every 30 seconds
- **Storage**: Credentials cached in-memory, persisted to disk
- **Network**: No external calls, purely local container management

## Future Enhancements

- Real-time container metrics API
- Container auto-scaling based on load
- Credential rotation policies
- Event webhooks to external systems
- Per-container rate limiting
- Container snapshots/restore functionality
