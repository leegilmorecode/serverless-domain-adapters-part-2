import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';

import { Construct } from 'constructs';

export class OrderServiceStatefulStack extends cdk.Stack {
  public ordersTable: dynamodb.Table;
  public customersTable: dynamodb.Table;
  public customerEventsIngressQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create our dynamodb table for storing new orders
    this.ordersTable = new dynamodb.Table(this, 'OrderServiceTable', {
      tableName: 'orders-domain-service-table',
      stream: dynamodb.StreamViewType.NEW_IMAGE, // we use dynamodb streams for change data capture
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // create the table for our customer events read store
    this.customersTable = new dynamodb.Table(this, 'CustomerReadStoreTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      tableName: 'customer-events-read-store-table',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create our events ingress queue for customer events (customer created specifically) to push to our internal read store
    this.customerEventsIngressQueue = new sqs.Queue(
      this,
      'CustomerEventsOrdersIngressQueue',
      {
        queueName: 'customer-events-orders-ingress-queue.fifo',
        fifo: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        contentBasedDeduplication: true,
        deadLetterQueue: {
          maxReceiveCount: 3,
          queue: new sqs.Queue(this, 'CustomerEventsOrdersIngressQueueDlq', {
            fifo: true,
            queueName: 'customer-events-orders-ingress-queue-dlq.fifo',
          }),
        },
      }
    );
  }
}
