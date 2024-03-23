import { Event } from '@dto/event';
import { logger } from '@shared';
import { SQSRecord } from 'aws-lambda';

export async function ordersEgressQueueProcessorUseCase(
  newEvent: SQSRecord
): Promise<SQSRecord> {
  const body = JSON.parse(newEvent.body);
  const message = JSON.parse(body.Message) as Event;

  // Note: We don't have a WMS system to send to, so we will log the event instead.
  logger.info(
    `calling our 3rd party WMS with data: ${JSON.stringify(message)}`
  );

  return newEvent;
}
