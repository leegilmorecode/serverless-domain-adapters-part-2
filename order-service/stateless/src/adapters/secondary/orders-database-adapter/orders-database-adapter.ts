import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

import { marshall } from '@aws-sdk/util-dynamodb';
import { config } from '@config';
import { Order } from '@dto/order';
import { logger } from '@shared';

const dynamoDb = new DynamoDBClient({});

export async function createOrder(order: Order): Promise<Order> {
  const tableName = config.get('ordersTableName');

  const params = {
    TableName: tableName,
    Item: marshall({ ...order }),
  };

  try {
    await dynamoDb.send(new PutItemCommand(params));

    logger.info(`order created with ${order.id} into ${tableName}`);

    return order;
  } catch (error) {
    console.error('error creating order:', error);
    throw error;
  }
}
