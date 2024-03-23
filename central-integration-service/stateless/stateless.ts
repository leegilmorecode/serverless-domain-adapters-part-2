import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as eventBridge from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface CentralIntegrationServiceStatelessStackProps
  extends cdk.StackProps {
  ordersTopic: sns.Topic;
  warehouseTopic: sns.Topic;
  deliveryTopic: sns.Topic;
  customerTopic: sns.Topic;
  bus: eventBridge.EventBus;
}

export class CentralIntegrationServiceStatelessStack extends cdk.Stack {
  private ordersTopic: sns.Topic;
  private warehouseTopic: sns.Topic;
  private deliveryTopic: sns.Topic;
  private customerTopic: sns.Topic;
  private ordersQueue: sqs.Queue;
  private warehouseQueue: sqs.Queue;
  private deliveryQueue: sqs.Queue;
  private customerQueue: sqs.Queue;
  private bus: eventBridge.EventBus;

  constructor(
    scope: Construct,
    id: string,
    props: CentralIntegrationServiceStatelessStackProps
  ) {
    super(scope, id, props);

    const { bus, ordersTopic, warehouseTopic, deliveryTopic, customerTopic } =
      props;

    this.bus = bus;
    this.ordersTopic = ordersTopic;
    this.warehouseTopic = warehouseTopic;
    this.deliveryTopic = deliveryTopic;
    this.customerTopic = customerTopic;

    const lambdaPowerToolsConfig = {
      LOG_LEVEL: 'DEBUG',
      POWERTOOLS_LOGGER_LOG_EVENT: 'true',
      POWERTOOLS_LOGGER_SAMPLE_RATE: '1',
      POWERTOOLS_TRACE_ENABLED: 'enabled',
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: 'captureHTTPsRequests',
      POWERTOOLS_SERVICE_NAME: 'central-integration-service',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'captureResult',
      POWERTOOLS_METRICS_NAMESPACE: 'LJAudio',
    };

    // create the sqs queue from the correct sns topic
    this.ordersQueue = new sqs.Queue(this, 'OrdersEventQueue', {
      queueName: 'orders-domains-event-queue',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: new sqs.Queue(this, 'OrdersEventQueueDlq', {
          queueName: 'orders-domains-event-queue-dlq',
        }),
      },
    });

    this.deliveryQueue = new sqs.Queue(this, 'DeliveryEventQueue', {
      queueName: 'delivery-domains-event-queue',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: new sqs.Queue(this, 'DeliveryEventQueueDlq', {
          queueName: 'delivery-domains-event-queue-dlq',
        }),
      },
    });

    this.customerQueue = new sqs.Queue(this, 'CustomerEventQueue', {
      queueName: 'customer-domains-event-queue',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: new sqs.Queue(this, 'CustomerEventQueueDlq', {
          queueName: 'customer-domains-event-queue-dlq',
        }),
      },
    });

    this.warehouseQueue = new sqs.Queue(this, 'WarehouseEventQueue', {
      queueName: 'warehouse-domains-event-queue',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: new sqs.Queue(this, 'WarehouseEventQueueDlq', {
          queueName: 'warehouse-domains-event-queue-dlq',
        }),
      },
    });

    // create the lambda function for the api gateway validation
    // and pushing messages to the correct sns topic directly (event gateway pattern)
    const eventValidatorLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'EventValidatorLambda', {
        functionName: 'event-validator',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/event-validator/event-validator.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          ORDERS_TOPIC: this.ordersTopic.topicArn,
          DELIVERY_TOPIC: this.deliveryTopic.topicArn,
          CUSTOMER_TOPIC: this.customerTopic.topicArn,
          WAREHOUSE_TOPIC: this.warehouseTopic.topicArn,
        },
      });

    // create the event producer handler for reading from the correct standard sqs queue
    // and pushing the events to the central eventbridge bus
    const ordersEventProducerLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'OrdersEventProducerLambda', {
        functionName: 'orders-event-producer',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/orders-event-producer/orders-event-producer.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CENTRAL_BUS_NAME: this.bus.eventBusName,
        },
      });

    const warehouseEventProducerLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'WarehouseEventProducerLambda', {
        functionName: 'warehouse-event-producer',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/warehouse-event-producer/warehouse-event-producer.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CENTRAL_BUS_NAME: this.bus.eventBusName,
        },
      });

    const customerEventProducerLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CustomerEventProducerLambda', {
        functionName: 'customer-event-producer',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/customer-event-producer/customer-event-producer.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CENTRAL_BUS_NAME: this.bus.eventBusName,
        },
      });

    const deliveryEventProducerLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'DeliveryEventProducerLambda', {
        functionName: 'delivery-event-producer',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/delivery-event-producer/delivery-event-producer.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CENTRAL_BUS_NAME: this.bus.eventBusName,
        },
      });

    // allow the event producer lambdas to put events to the central bus
    ordersEventProducerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [this.bus.eventBusArn],
      })
    );

    deliveryEventProducerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [this.bus.eventBusArn],
      })
    );

    warehouseEventProducerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [this.bus.eventBusArn],
      })
    );

    customerEventProducerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [this.bus.eventBusArn],
      })
    );

    // add the lambda event source for the correct queue so we can read the events
    ordersEventProducerLambda.addEventSource(
      new SqsEventSource(this.ordersQueue, {
        batchSize: 10, // we can set this up to 10K, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    deliveryEventProducerLambda.addEventSource(
      new SqsEventSource(this.deliveryQueue, {
        batchSize: 10, // we can set this up to 10K, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    customerEventProducerLambda.addEventSource(
      new SqsEventSource(this.customerQueue, {
        batchSize: 10, // we can set this up to 10K, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    warehouseEventProducerLambda.addEventSource(
      new SqsEventSource(this.warehouseQueue, {
        batchSize: 10, // we can set this up to 10K, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    // allow the producer function to read from the queue and write to the central event bus
    this.ordersQueue.grantConsumeMessages(ordersEventProducerLambda);
    this.deliveryQueue.grantConsumeMessages(deliveryEventProducerLambda);
    this.warehouseQueue.grantConsumeMessages(warehouseEventProducerLambda);
    this.customerQueue.grantConsumeMessages(customerEventProducerLambda);

    // ensure the event validator lambda function can publish messages to the correct topic
    this.ordersTopic.grantPublish(eventValidatorLambda);
    this.customerTopic.grantPublish(eventValidatorLambda);
    this.deliveryTopic.grantPublish(eventValidatorLambda);
    this.warehouseTopic.grantPublish(eventValidatorLambda);

    // create the event gateway i.e. our api for raising events
    const api: apigw.RestApi = new apigw.RestApi(this, 'Api', {
      description: 'LJ Audio - Event Gateway API',
      deploy: true,
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
    });

    // create our resources on the api for 'events'
    const root: apigw.Resource = api.root.addResource('v1');
    const events: apigw.Resource = root.addResource('events');

    // add a post endpoint so we can create events
    events.addMethod(
      'POST',
      new apigw.LambdaIntegration(eventValidatorLambda, {
        proxy: true,
      })
    );

    // ensure that messages pushed to the fifo topic go to our correct queue
    this.ordersTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.ordersQueue)
    );
    this.warehouseTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.warehouseQueue)
    );
    this.deliveryTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.deliveryQueue)
    );
    this.customerTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.customerQueue)
    );
  }
}
