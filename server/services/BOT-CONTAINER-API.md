# WhatsApp Bot Container System - API Documentation

## Overview

The Bot Container System provides isolated, containerized WhatsApp bot instances with:
- **Per-bot credential management** - Each bot has its own isolated auth directory
- **Heartbeat monitoring** - Keeps connections alive with periodic health checks
- **Event listener system** - Comprehensive event tracking (connections, messages, credentials, presence)
- **Container lifecycle management** - Proper initialization, running, and cleanup
- **Cross-container isolation** - No interference between bots

## Architecture Components

### 1. BotContainer Class (`bot-container.ts`)

Main container wrapper for each bot instance with heartbeat and event management.

#### Constructor
```typescript
new BotContainer({
  botInstance: BotInstance,
  heartbeatInterval?: number,     // Default: 30000ms
  maxReconnectAttempts?: number   // Default: 10
})
```

#### Key Methods

**Lifecycle Methods:**
- `async start()` - Start the container and bot instance
- `async stop()` - Gracefully stop the container and cleanup
- `getStatus()` - Get detailed container status

**Event Management:**
- `onContainerEvent(eventType, callback)` - Register event listener
  - Event types: `'connection-update'`, `'message-upsert'`, `'creds-update'`, `'presence-update'`, `'error'`
- `getEventHistory(limit)` - Retrieve event history for monitoring
- `on(eventType, callback)` - EventEmitter-style event listening

**Health & Monitoring:**
- `isContainerHealthy()` - Check if container is healthy and running
- `getCredentialAge()` - Get time since last credential update
- `getBot()` - Get underlying WhatsAppBot instance
- `getBotInstance()` - Get bot configuration

#### Container Status Object
```typescript
{
  containerId: string;              // "serverName:botId"
  botStatus: string;                // online | offline | loading
  containerState: 'initializing' | 'running' | 'stopping' | 'stopped';
  isHealthy: boolean;
  lastHeartbeat: string;            // ISO timestamp
  connectionAttempts: number;
  credsLastUpdated: string;         // ISO timestamp
  eventHistorySize: number;
}
```

#### Container Events
```typescript
interface BotContainerEvent {
  type: 'connection-update' | 'message-upsert' | 'creds-update' | 'presence-update' | 'error';
  data: any;           // Event-specific data
  timestamp: number;   // Unix timestamp
}
```

### 2. CredentialsManager Class (`credentials-manager.ts`)

Handles per-bot credential storage, validation, and lifecycle management.

#### Methods

**Credential Operations:**
- `async saveCredentials(botInstance, credentials)` - Save credentials to bot directory
- `async loadCredentials(botInstance)` - Load credentials from bot directory
- `async hasCredentials(botInstance)` - Check if credentials exist
- `async backupCredentials(botInstance)` - Create backup of current credentials
- `async clearAllCredentials(botInstance)` - Clear all credentials (with backup)

**Metadata Operations:**
- `async getCredentialMetadata(botInstance)` - Get credential metadata
- `async isCredentialExpired(botInstance)` - Check if credentials are expired (90 days)
- `async getCredentialAge(botInstance)` - Get age in milliseconds

**Directory Operations:**
- `async getAllBotDirs(serverName)` - List all bot auth directories
- `async getCredentialStats(serverName)` - Get statistics about stored credentials
- `async clearCache(botInstanceId)` - Clear in-memory cache

#### Credential Metadata
```typescript
interface CredentialMetadata {
  botId: string;
  phoneNumber?: string;
  lastUpdated: number;          // Unix timestamp
  expiresAt?: number;
  verified: boolean;
  version: string;
}
```

### 3. Enhanced BotManager Class

Extended with container management capabilities.

#### New Methods
- `async createBotContainer(botId, botInstance)` - Create isolated bot container
- `getBotContainer(botId)` - Get container instance
- `getAllBotContainers()` - Get all active containers
- `getContainerHealthStatus()` - Get health status of all containers
- `getContainerEventHistory(botId, limit)` - Get event history for monitoring

## Directory Structure

Each bot gets isolated directory structure:
```
auth/
├── serverName/
│   ├── bot_{botId}/
│   │   ├── creds.json              # Baileys credentials
│   │   ├── creds.metadata.json     # Credential metadata
│   │   ├── creds.backup.*.json     # Backup files
│   │   └── [other Baileys files]
│   └── bot_{botId2}/
```

## Usage Examples

### Creating and Starting a Bot Container
```typescript
import { botManager } from './services/bot-manager';

const botInstance = await storage.getBotInstance(botId);
const container = await botManager.createBotContainer(botId, botInstance);

// Start the container
await container.start();

// Monitor container health
const status = container.getStatus();
console.log(status.isHealthy); // true/false
```

### Registering Event Listeners
```typescript
const container = botManager.getBotContainer(botId);

// Listen to credentials updates
container.onContainerEvent('creds-update', (event) => {
  console.log('Credentials updated:', event.data);
});

// Listen to connection events
container.onContainerEvent('connection-update', (event) => {
  console.log('Connection state:', event.data.connection);
});

// Listen to all errors
container.onContainerEvent('error', (event) => {
  console.error('Bot error:', event.data.message);
});
```

### Managing Credentials
```typescript
import { credentialsManager } from './services/credentials-manager';

// Load credentials
const creds = await credentialsManager.loadCredentials(botInstance);

// Check metadata
const metadata = await credentialsManager.getCredentialMetadata(botInstance);
console.log(metadata.lastUpdated); // When creds were last updated

// Check if expired
const isExpired = await credentialsManager.isCredentialExpired(botInstance);
if (isExpired) {
  // Trigger re-authentication
}

// Backup before updating
await credentialsManager.backupCredentials(botInstance);
await credentialsManager.saveCredentials(botInstance, newCreds);
```

### Monitoring Multiple Containers
```typescript
// Get health status of all containers
const allStatus = botManager.getContainerHealthStatus();
Object.entries(allStatus).forEach(([botId, status]) => {
  console.log(`${botId}: ${status.isHealthy ? 'Healthy' : 'Unhealthy'}`);
});

// Get event history for debugging
const events = botManager.getContainerEventHistory(botId, 20);
events.forEach(event => {
  console.log(`[${event.timestamp}] ${event.type}:`, event.data);
});
```

## Key Features

### 1. Heartbeat Monitoring
- Every container maintains a heartbeat every 30 seconds
- Detects stale connections automatically
- Triggers reconnection if heartbeat timeout
- Exponential backoff for reconnection attempts

### 2. Event History
- Last 100 events stored per container
- Includes: connections, messages, credentials, presence, errors
- Useful for debugging and monitoring
- Automatic cleanup of old entries

### 3. Credential Isolation
- Each bot has separate auth directory
- Credentials backed up before updates
- Metadata tracks verification status and expiration
- 90-day expiration detection

### 4. Container States
- `initializing` - Container being set up
- `running` - Container active and processing
- `stopping` - Graceful shutdown in progress
- `stopped` - Container inactive

## Error Handling

All container operations include error handling:
- Connection failures trigger automatic reconnection
- Credential errors prevent infinite loops
- Event listeners wrapped in try-catch
- Graceful degradation on partial failures

## Performance Considerations

- **Memory**: Event history limited to 100 entries per container
- **CPU**: Heartbeat interval is 30s (configurable)
- **Storage**: Credentials cached in-memory, persisted to disk
- **Concurrency**: Each container runs independently with no shared state

## Migration Guide

If migrating from legacy bot system to containers:

1. Update BotManager initialization to use containers
2. Register event listeners for monitoring
3. Update credential loading to use CredentialsManager
4. Migrate existing credentials to new directory structure
5. Monitor container health status

## Future Enhancements

- [ ] Metrics/telemetry integration
- [ ] Container auto-scaling based on load
- [ ] Credential rotation policies
- [ ] Event stream to external systems
- [ ] Per-container rate limiting
- [ ] Container snapshots/restore
