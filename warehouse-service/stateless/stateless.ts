import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

interface WarehouseServiceStatelessStackProps extends cdk.StackProps {
  eventsEgressQueue: sqs.Queue;
  central: string;
}

export class WarehouseServiceStatelessStack extends cdk.Stack {
  private eventsEgressQueue: sqs.Queue;

  constructor(
    scope: Construct,
    id: string,
    props: WarehouseServiceStatelessStackProps
  ) {
    super(scope, id, props);

    const { eventsEgressQueue, central } = props;

    this.eventsEgressQueue = eventsEgressQueue;

    const lambdaPowerToolsConfig = {
      LOG_LEVEL: 'DEBUG',
      POWERTOOLS_LOGGER_LOG_EVENT: 'true',
      POWERTOOLS_LOGGER_SAMPLE_RATE: '1',
      POWERTOOLS_TRACE_ENABLED: 'enabled',
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: 'captureHTTPsRequests',
      POWERTOOLS_SERVICE_NAME: 'warehouse-egress-adapter-service',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'captureResult',
      POWERTOOLS_METRICS_NAMESPACE: 'LJAudio',
    };

    // we create the lambda function that reads from our fifo queue and sends request to the WMS system.
    // note: we are not going to send to a system for this article, and will just log the events to view.
    const egressQueueProcessor: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'OrdersEgressQueueProcessorLambda', {
        functionName: 'orders-egress-queue-processor',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/orders-egress-queue-processor/orders-egress-queue-processor.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
        },
      });

    // ensure our lambda function is invoked from the fifo queue
    egressQueueProcessor.addEventSource(
      new SqsEventSource(this.eventsEgressQueue, {
        batchSize: 1, // we can set this up to 10, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    // get access to the central orders topic so we can subscribe to it
    const ordersCentralTopic = sns.Topic.fromTopicArn(
      this,
      'OrdersCentralTopic',
      `arn:aws:sns:eu-west-1:${central}:orders-domains-topic.fifo`
    );

    // ensure that our sqs queue is subscribed to the orders central topic for listening to order created events
    ordersCentralTopic.addSubscription(
      new SqsSubscription(this.eventsEgressQueue, {
        rawMessageDelivery: false,
        filterPolicyWithMessageBody: {
          ['detail.metadata.type']: sns.FilterOrPolicy.filter(
            sns.SubscriptionFilter.stringFilter({
              allowlist: ['OrderCreated', 'OrderUpdated'], // we are only interested in OrderCreated and OrderUpdated events from this topic
            })
          ),
        },
      })
    );
  }
}
