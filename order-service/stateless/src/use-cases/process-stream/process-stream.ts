import { domains, logger } from '@shared';

import { publishMessage } from '@adapters/secondary';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { config } from '@config';
import { Event } from '@dto/event';
import { Order } from '@dto/order';
import { SQSRecord } from 'aws-lambda';

export async function processStreamUseCase(
  newEvent: SQSRecord
): Promise<SQSRecord> {
  const ordersTopicArn = config.get('ordersTopicArn');

  const body = JSON.parse(newEvent.body);
  const parsedEvent = unmarshall(body.dynamodb.NewImage) as Order;

  // create the correct event shape
  const event: Event = {
    created: parsedEvent.created as string,
    detail: {
      metadata: {
        domain: domains.orders,
        source: 'orders-domain-service',
        type: 'OrderCreated',
        id: parsedEvent.orderNumber as string,
      },
      data: parsedEvent,
    },
  };

  logger.info(`event: ${JSON.stringify(event)}`);

  // create the correct message group id
  const { domain, source, id } = event.detail.metadata;
  const messageGroupId = `${domain}.${source}.${id}`;

  // publish the message to the central orders topic
  await publishMessage(ordersTopicArn, JSON.stringify(event), messageGroupId);

  return newEvent;
}
