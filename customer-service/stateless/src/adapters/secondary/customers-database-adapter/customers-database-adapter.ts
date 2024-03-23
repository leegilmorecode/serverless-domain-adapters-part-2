import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

import { marshall } from '@aws-sdk/util-dynamodb';
import { config } from '@config';
import { Customer } from '@dto/customer';
import { logger } from '@shared';

const dynamoDb = new DynamoDBClient({});

export async function createCustomer(customer: Customer): Promise<Customer> {
  const tableName = config.get('customersTableName');

  const params = {
    TableName: tableName,
    Item: marshall({ id: customer.customerId, ...customer }),
  };

  try {
    await dynamoDb.send(new PutItemCommand(params));

    logger.info(
      `customer created with ${customer.customerId} into ${tableName}`
    );

    return customer;
  } catch (error) {
    console.error('error creating customer:', error);
    throw error;
  }
}
