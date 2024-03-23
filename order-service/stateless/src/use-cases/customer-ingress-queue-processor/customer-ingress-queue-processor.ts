import { createCustomer } from '@adapters/secondary/customers-database-adapter';
import { Event } from '@dto/event';
import { logger } from '@shared';
import { SQSRecord } from 'aws-lambda';

export async function customerIngressQueueProcessorUseCase(
  newEvent: SQSRecord
): Promise<SQSRecord> {
  const body = JSON.parse(newEvent.body);
  const message = JSON.parse(body.Message) as Event;

  logger.info(`writing the event: ${message.detail.metadata.id} to the table`);

  // write the customer event to the read only store
  await createCustomer(message);

  return newEvent;
}
