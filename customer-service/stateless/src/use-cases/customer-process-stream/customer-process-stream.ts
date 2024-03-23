import { domains, logger } from '@shared';

import { publishMessage } from '@adapters/secondary';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { config } from '@config';
import { Customer } from '@dto/customer';
import { Event } from '@dto/event';
import { SQSRecord } from 'aws-lambda';

export async function customerProcessStreamUseCase(
  newEvent: SQSRecord
): Promise<SQSRecord> {
  const customerTopicArn = config.get('customerTopicArn');

  const body = JSON.parse(newEvent.body);
  const parsedEvent = unmarshall(body.dynamodb.NewImage) as Customer;

  // create the correct event shape
  const event: Event = {
    created: parsedEvent.created as string,
    detail: {
      metadata: {
        domain: domains.customer,
        source: 'customer-ingress-adapter',
        type: 'CustomerCreated',
        id: parsedEvent.customerId as string,
      },
      data: parsedEvent,
    },
  };

  logger.info(`event: ${JSON.stringify(event)}`);

  // create the correct message group id
  const { domain, source, id } = event.detail.metadata;
  const messageGroupId = `${domain}.${source}.${id}`;

  // publish the message
  await publishMessage(customerTopicArn, JSON.stringify(event), messageGroupId);

  return newEvent;
}
