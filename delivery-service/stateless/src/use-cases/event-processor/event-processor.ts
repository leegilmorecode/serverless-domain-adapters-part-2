import { createRecord } from '@adapters/secondary/database-adapter';
import { Event } from '@dto/event';
import { logger } from '@shared';
import { SQSRecord } from 'aws-lambda';

export async function eventProcessorUseCase(
  newEvent: SQSRecord
): Promise<SQSRecord> {
  const message = JSON.parse(newEvent.body) as Event;
  logger.info(
    `writing the event: ${JSON.stringify(
      message.detail.metadata.id
    )} to the table`
  );
  await createRecord(message);

  return newEvent;
}
