/**
 * Base Event Interface
 * All domain events should implement this interface
 */
export interface BaseEvent {
  readonly userId: number;
  readonly timestamp: Date;
}

/**
 * Base Event Class
 * Provides common functionality for all domain events
 */
export abstract class BaseEventClass implements BaseEvent {
  public readonly userId: number;
  public readonly timestamp: Date;

  constructor(userId: number) {
    this.userId = userId;
    this.timestamp = new Date();
  }
}

/**
 * Event Metadata Interface
 * Additional metadata that can be attached to events
 */
export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly version?: number;
  readonly source?: string;
}
