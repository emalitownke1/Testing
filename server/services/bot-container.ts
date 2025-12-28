/**
 * Bot Container Service
 * 
 * Manages isolated WhatsApp bot containers with:
 * - Per-bot credential management
 * - Heartbeat/keep-alive connections
 * - Event listener registry
 * - Container lifecycle management
 * - Cross-container isolation
 */

import { WhatsAppBot } from './whatsapp-bot';
import type { BotInstance } from '@shared/schema';
import { EventEmitter } from 'events';

export interface BotContainerConfig {
  botInstance: BotInstance;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
}

export interface BotContainerEvent {
  type: 'connection-update' | 'message-upsert' | 'creds-update' | 'presence-update' | 'error';
  data: any;
  timestamp: number;
}

export class BotContainer extends EventEmitter {
  private botInstance: BotInstance;
  private bot: WhatsAppBot;
  private containerName: string;
  private isHealthy: boolean = false;
  private lastHeartbeat: number = Date.now();
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatDuration: number;
  private eventListeners: Map<string, Function[]> = new Map();
  private connectionAttempts: number = 0;
  private maxReconnectAttempts: number;
  private containerState: 'initializing' | 'running' | 'stopping' | 'stopped' = 'initializing';
  private credsLastUpdated: number = Date.now();
  private eventHistory: BotContainerEvent[] = [];
  private maxEventHistory: number = 100;

  constructor(config: BotContainerConfig) {
    super();
    
    this.botInstance = config.botInstance;
    this.bot = new WhatsAppBot(config.botInstance);
    this.containerName = `${config.botInstance.serverName}:${config.botInstance.id}`;
    this.heartbeatDuration = config.heartbeatInterval || 30000; // 30 seconds default
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;

    console.log(`🎁 [Container] Initializing container for bot: ${this.containerName}`);
    this.setupEventListeners();
  }

  /**
   * Setup internal event listeners for the bot
   */
  private setupEventListeners() {
    // Listen for connection updates
    const sock = this.bot.getSock();
    if (sock) {
      sock.ev.on('connection.update', (update: any) => {
        this.handleConnectionUpdate(update);
      });

      sock.ev.on('messages.upsert', (m: any) => {
        this.handleMessageUpsert(m);
      });

      sock.ev.on('creds.update', (creds: any) => {
        this.handleCredsUpdate(creds);
      });

      sock.ev.on('presence.update', (update: any) => {
        this.handlePresenceUpdate(update);
      });

      sock.ev.on('error', (error: any) => {
        this.handleError(error);
      });
    }
  }

  /**
   * Handle connection update events
   */
  private handleConnectionUpdate(update: any) {
    const event: BotContainerEvent = {
      type: 'connection-update',
      data: update,
      timestamp: Date.now()
    };

    this.addEventToHistory(event);
    this.emitContainerEvent(event);

    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      this.isHealthy = true;
      this.connectionAttempts = 0;
      console.log(`✅ [Container-${this.containerName}] Connected and healthy`);
      this.startHeartbeat();
    } else if (connection === 'close') {
      this.isHealthy = false;
      console.log(`❌ [Container-${this.containerName}] Disconnected - attempting recovery`);
      this.stopHeartbeat();
      
      if (this.connectionAttempts < this.maxReconnectAttempts) {
        this.connectionAttempts++;
        this.scheduleReconnection();
      }
    } else if (connection === 'connecting') {
      console.log(`🔄 [Container-${this.containerName}] Connecting... (attempt ${this.connectionAttempts + 1})`);
    }
  }

  /**
   * Handle message upsert events
   */
  private handleMessageUpsert(messages: any) {
    const event: BotContainerEvent = {
      type: 'message-upsert',
      data: messages,
      timestamp: Date.now()
    };

    this.addEventToHistory(event);
    this.emitContainerEvent(event);
    this.updateHeartbeat();
  }

  /**
   * Handle credentials update events
   */
  private handleCredsUpdate(creds: any) {
    this.credsLastUpdated = Date.now();
    
    const event: BotContainerEvent = {
      type: 'creds-update',
      data: { timestamp: this.credsLastUpdated, credKeys: Object.keys(creds || {}) },
      timestamp: Date.now()
    };

    this.addEventToHistory(event);
    this.emitContainerEvent(event);

    console.log(`🔐 [Container-${this.containerName}] Credentials updated at ${new Date(this.credsLastUpdated).toISOString()}`);
  }

  /**
   * Handle presence update events
   */
  private handlePresenceUpdate(update: any) {
    const event: BotContainerEvent = {
      type: 'presence-update',
      data: update,
      timestamp: Date.now()
    };

    this.addEventToHistory(event);
    this.emitContainerEvent(event);
    this.updateHeartbeat();
  }

  /**
   * Handle error events
   */
  private handleError(error: any) {
    const event: BotContainerEvent = {
      type: 'error',
      data: { message: error?.message, code: error?.code },
      timestamp: Date.now()
    };

    this.addEventToHistory(event);
    this.emitContainerEvent(event);

    console.error(`⚠️ [Container-${this.containerName}] Error: ${error?.message || 'Unknown error'}`);
  }

  /**
   * Emit container events to external listeners
   */
  private emitContainerEvent(event: BotContainerEvent) {
    const listeners = this.eventListeners.get(event.type) || [];
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[Container-${this.containerName}] Error in event listener:`, error);
      }
    });

    this.emit(event.type, event);
  }

  /**
   * Add event to history for monitoring
   */
  private addEventToHistory(event: BotContainerEvent) {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }
  }

  /**
   * Start heartbeat monitor
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) return; // Already running

    console.log(`💓 [Container-${this.containerName}] Starting heartbeat monitor (${this.heartbeatDuration}ms)`);

    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastHeartbeat;

      if (timeSinceLastActivity > this.heartbeatDuration * 2) {
        console.warn(`⚠️ [Container-${this.containerName}] Heartbeat timeout - connection may be stale`);
        this.isHealthy = false;
      } else {
        this.isHealthy = true;
      }
    }, this.heartbeatDuration);
  }

  /**
   * Stop heartbeat monitor
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
      console.log(`⏹️ [Container-${this.containerName}] Heartbeat stopped`);
    }
  }

  /**
   * Update heartbeat timestamp on activity
   */
  private updateHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnection() {
    const delay = Math.min(5000 * Math.pow(2, this.connectionAttempts - 1), 300000); // Max 5 min
    console.log(`⏳ [Container-${this.containerName}] Scheduling reconnection in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.bot.start();
      } catch (error) {
        console.error(`[Container-${this.containerName}] Reconnection failed:`, error);
      }
    }, delay);
  }

  /**
   * Start the container (initialize bot)
   */
  async start() {
    try {
      this.containerState = 'running';
      console.log(`▶️ [Container-${this.containerName}] Starting...`);
      await this.bot.start();
      this.startHeartbeat();
      return true;
    } catch (error) {
      console.error(`[Container-${this.containerName}] Failed to start:`, error);
      this.containerState = 'stopped';
      throw error;
    }
  }

  /**
   * Stop the container
   */
  async stop() {
    try {
      this.containerState = 'stopping';
      console.log(`⏹️ [Container-${this.containerName}] Stopping...`);
      this.stopHeartbeat();
      await this.bot.stop();
      this.containerState = 'stopped';
      this.isHealthy = false;
      console.log(`✅ [Container-${this.containerName}] Stopped`);
      return true;
    } catch (error) {
      console.error(`[Container-${this.containerName}] Error during stop:`, error);
      throw error;
    }
  }

  /**
   * Get container status
   */
  getStatus() {
    return {
      containerId: this.containerName,
      botStatus: this.bot.getStatus(),
      containerState: this.containerState,
      isHealthy: this.isHealthy,
      lastHeartbeat: new Date(this.lastHeartbeat).toISOString(),
      connectionAttempts: this.connectionAttempts,
      credsLastUpdated: new Date(this.credsLastUpdated).toISOString(),
      eventHistorySize: this.eventHistory.length
    };
  }

  /**
   * Get event history for monitoring
   */
  getEventHistory(limit?: number): BotContainerEvent[] {
    if (!limit) return this.eventHistory;
    return this.eventHistory.slice(-limit);
  }

  /**
   * Register event listener for container events
   */
  onContainerEvent(eventType: 'connection-update' | 'message-upsert' | 'creds-update' | 'presence-update' | 'error', 
                   callback: (event: BotContainerEvent) => void) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
    return () => {
      const listeners = this.eventListeners.get(eventType) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  /**
   * Get the underlying bot instance
   */
  getBot(): WhatsAppBot {
    return this.bot;
  }

  /**
   * Get the bot instance configuration
   */
  getBotInstance(): BotInstance {
    return this.botInstance;
  }

  /**
   * Update bot instance configuration
   */
  updateBotInstance(botInstance: BotInstance) {
    this.botInstance = botInstance;
    this.bot.updateBotInstance(botInstance);
  }

  /**
   * Get container name
   */
  getContainerName(): string {
    return this.containerName;
  }

  /**
   * Check if container is healthy
   */
  isContainerHealthy(): boolean {
    return this.isHealthy && this.containerState === 'running';
  }

  /**
   * Get time since last credentials update
   */
  getCredentialAge(): number {
    return Date.now() - this.credsLastUpdated;
  }
}
