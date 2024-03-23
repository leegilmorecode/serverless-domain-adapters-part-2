import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';

import { Construct } from 'constructs';

export class WarehouseServiceStatefulStack extends cdk.Stack {
  public eventsEgressQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create our events egress queue for orders events (order created specifically) to push to our external WMS
    this.eventsEgressQueue = new sqs.Queue(
      this,
      'OrdersEventsWarehouseEgressQueue',
      {
        queueName: 'orders-events-warehouse-egress-queue.fifo',
        fifo: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        contentBasedDeduplication: true,
        deadLetterQueue: {
          maxReceiveCount: 3,
          queue: new sqs.Queue(this, 'OrdersEventsWarehouseEgressQueueDlq', {
            fifo: true,
            queueName: 'orders-events-warehouse-egress-queue-dlq.fifo',
          }),
        },
      }
    );
  }
}
