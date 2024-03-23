import { domains, logger, schemaValidator } from '@shared';

import { publishMessage } from '@adapters/secondary';
import { config } from '@config';
import { Event } from '@dto/event';
import { ValidationError } from '@errors/validation-error';
import { schema } from '@schemas/event';

// get the correct topic arns for our domain fifo topics
const ordersTopicArn = config.get('ordersTopicArn');
const customerTopicArn = config.get('customerTopicArn');
const deliveryTopicArn = config.get('deliveryTopicArn');
const warehouseTopicArn = config.get('warehouseTopicArn');

export async function eventValidatorUseCase(newEvent: Event): Promise<Event> {
  let topicArn;

  logger.info(`event: ${JSON.stringify(newEvent)}`);

  // create our event object based on the api gateway payload
  const event: Event = {
    ...newEvent,
  };

  // validate the payload aganst the correct schema for the detailType and source
  // for example, OrderCreated event from the orders.domain service.
  schemaValidator(schema, event);

  // create our unique messageGroupId for the ordering in the sns topic
  // for example: 'domain.source.id' e.g. 'orders.orders-domain.6fc292ce-059b-469a-94ea-a9860d0604ab'
  const { domain, source, id } = event.detail.metadata;
  const messageGroupId = `${domain}.${source}.${id}`;

  // get the correct topic based on the source of the event
  switch (domain) {
    case domains.orders:
      topicArn = ordersTopicArn;
      break;
    case domains.delivery:
      topicArn = deliveryTopicArn;
      break;
    case domains.customer:
      topicArn = customerTopicArn;
      break;
    case domains.warehouse:
      topicArn = warehouseTopicArn;
      break;
    default:
      throw new ValidationError(`source topic: ${source} does not exist`);
  }

  // publish the message to the right topic with the correct messageGroupId
  await publishMessage(topicArn, JSON.stringify(event), messageGroupId);

  logger.info(`event validated and published to the ${topicArn} topic`);

  return event;
}
