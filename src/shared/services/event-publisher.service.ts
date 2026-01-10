import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseEvent } from '../events/base.event';

/**
 * Event Publisher Service
 * Centralized service for publishing domain events
 */
@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Publish a domain event
   * @param event The event to publish
   * @param eventName Optional custom event name (defaults to class name)
   */
  async publish<T extends BaseEvent>(
    event: T,
    eventName?: string,
  ): Promise<void> {
    try {
      const name = eventName || event.constructor.name;

      this.logger.debug(`Publishing event: ${name}`, {
        userId: event.userId,
        timestamp: event.timestamp,
      });

      await this.eventEmitter.emitAsync(name, event);

      this.logger.debug(`Event published successfully: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to publish event: ${event.constructor.name}`, {
        error: error.message,
        stack: error.stack,
        userId: event.userId,
      });
      throw error;
    }
  }

  /**
   * Publish multiple events in batch
   * @param events Array of events to publish
   */
  async publishBatch<T extends BaseEvent>(events: T[]): Promise<void> {
    this.logger.debug(`Publishing batch of ${events.length} events`);

    const promises = events.map((event) => this.publish(event));
    await Promise.all(promises);

    this.logger.debug(
      `Batch of ${events.length} events published successfully`,
    );
  }

  /**
   * Publish event synchronously (for critical events)
   * @param event The event to publish
   * @param eventName Optional custom event name
   */
  publishSync<T extends BaseEvent>(event: T, eventName?: string): void {
    try {
      const name = eventName || event.constructor.name;

      this.logger.debug(`Publishing event synchronously: ${name}`, {
        userId: event.userId,
        timestamp: event.timestamp,
      });

      this.eventEmitter.emit(name, event);

      this.logger.debug(`Event published synchronously: ${name}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish event synchronously: ${event.constructor.name}`,
        {
          error: error.message,
          stack: error.stack,
          userId: event.userId,
        },
      );
      throw error;
    }
  }
}
