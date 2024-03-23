import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

import { marshall } from '@aws-sdk/util-dynamodb';
import { config } from '@config';
import { Event } from '@dto/event';
import { logger } from '@shared';

const dynamoDb = new DynamoDBClient({});

export async function createCustomer(event: Event): Promise<Event> {
  const tableName = config.get('customersTableName');

  const params = {
    TableName: tableName,
    Item: marshall({ ...event.detail.data, id: event.detail.metadata.id }),
  };

  try {
    await dynamoDb.send(new PutItemCommand(params));

    logger.info(
      `customer created with ${event.detail.metadata.id} into ${tableName}`
    );

    return event;
  } catch (error) {
    console.error('error creating customer:', error);
    throw error;
  }
}
