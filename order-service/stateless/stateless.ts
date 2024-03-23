import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

interface OrderServiceStatelessStackProps extends cdk.StackProps {
  ordersTable: dynamodb.Table;
  customersTable: dynamodb.Table;
  central: string;
  customerEventsIngressQueue: sqs.Queue;
}

export class OrderServiceStatelessStack extends cdk.Stack {
  private ordersTable: dynamodb.Table;
  private customersTable: dynamodb.Table;
  private eventsStreamQueue: sqs.Queue;
  private customerEventsIngressQueue: sqs.Queue;

  constructor(
    scope: Construct,
    id: string,
    props: OrderServiceStatelessStackProps
  ) {
    super(scope, id, props);

    const { ordersTable, customersTable, central, customerEventsIngressQueue } =
      props;

    this.customerEventsIngressQueue = customerEventsIngressQueue;

    this.ordersTable = ordersTable;
    this.customersTable = customersTable;

    const lambdaPowerToolsConfig = {
      LOG_LEVEL: 'DEBUG',
      POWERTOOLS_LOGGER_LOG_EVENT: 'true',
      POWERTOOLS_LOGGER_SAMPLE_RATE: '1',
      POWERTOOLS_TRACE_ENABLED: 'enabled',
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: 'captureHTTPsRequests',
      POWERTOOLS_SERVICE_NAME: 'orders-domain-service',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'captureResult',
      POWERTOOLS_METRICS_NAMESPACE: 'LJAudio',
    };

    // create our events queue from a dynamodb stream via pipes (our outbox)
    this.eventsStreamQueue = new sqs.Queue(this, 'OrdersEventStreamsQueue', {
      queueName: 'orders-event-stream-queue.fifo',
      fifo: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'OrdersEventStreamsQueueDlq', {
          fifo: true,
          queueName: 'orders-event-stream-queue-dlq.fifo',
        }),
      },
    });

    // create the api for raising new orders in the orders domain service
    const api: apigw.RestApi = new apigw.RestApi(this, 'Api', {
      description: 'LJ Audio - Orders API',
      deploy: true,
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
    });

    // create the 'create order' lambda function
    const createOrderLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CreateOrderLambda', {
        functionName: 'orders-domain-create-order',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/create-order/create-order.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          ORDERS_TABLE_NAME: this.ordersTable.tableName,
        },
      });

    // create the 'order processor' lambda which reads from the stream queue
    const processStreamLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'ProcessStreamLambda', {
        functionName: 'orders-process-stream-order',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/process-stream/process-stream.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          ORDERS_TOPIC_ARN: `arn:aws:sns:eu-west-1:${central}:orders-domains-topic.fifo`,
        },
      });

    // allow the lambda function to publish messages to the central account
    const ordersTopic = sns.Topic.fromTopicArn(
      this,
      'OrdersTopic',
      `arn:aws:sns:eu-west-1:${central}:orders-domains-topic.fifo`
    );
    ordersTopic.grantPublish(processStreamLambda);

    // allow the lambda to process messages from the queue
    this.eventsStreamQueue.grantConsumeMessages(processStreamLambda);

    // allow the lambda to write to the database table
    this.ordersTable.grantWriteData(createOrderLambda);

    // create the pipe role
    const pipeRole = new iam.Role(this, 'PipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });

    this.ordersTable.grantStreamRead(pipeRole);
    this.eventsStreamQueue.grantSendMessages(pipeRole);

    // add the eventbridge pipe for the stream. Note: the L2 construct is currently in alpha
    new pipes.CfnPipe(this, 'OrdersStreamPipe', {
      roleArn: pipeRole.roleArn,
      source: this.ordersTable.tableStreamArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: 'LATEST',
          batchSize: 1,
          maximumRetryAttempts: 3,
        },
        filterCriteria: {
          filters: [
            {
              pattern: '{"eventName" : ["INSERT"] }', // we are only interested in raising events for new orders in this example
            },
          ],
        },
      },
      target: this.eventsStreamQueue.queueArn,
      targetParameters: {
        sqsQueueParameters: {
          messageDeduplicationId: '$.eventID',
          messageGroupId: '$.dynamodb.Keys.id.S',
        },
      },
    });

    // create our resources on the api for 'orders'
    const root: apigw.Resource = api.root.addResource('v1');
    const events: apigw.Resource = root.addResource('orders');

    // add a post endpoint so we can create orders in our private orders domain service
    events.addMethod(
      'POST',
      new apigw.LambdaIntegration(createOrderLambda, {
        proxy: true,
      })
    );

    // ensure our lambda function is invoked from the queue
    processStreamLambda.addEventSource(
      new SqsEventSource(this.eventsStreamQueue, {
        batchSize: 1, // we can set this up to 10, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    // we create the lambda function that reads from our fifo queue and populates our customer read store.
    const customerIngressQueueProcessor: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CustomerIngressQueueProcessor', {
        functionName: 'customer-ingress-queue-processor',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/customer-ingress-queue-processor/customer-ingress-queue-processor.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CUSTOMERS_TABLE_NAME: this.customersTable.tableName,
        },
      });

    // allow the event processor to write to the customer table
    this.customersTable.grantWriteData(customerIngressQueueProcessor);

    // ensure our lambda function is invoked from the fifo queue
    customerIngressQueueProcessor.addEventSource(
      new SqsEventSource(this.customerEventsIngressQueue, {
        batchSize: 1, // we can set this up to 10, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    // get access to the central customers topic so we can subscribe to it
    const customerCentralTopic = sns.Topic.fromTopicArn(
      this,
      'CustomerCentralTopic',
      `arn:aws:sns:eu-west-1:${central}:customer-domains-topic.fifo`
    );

    // ensure that our sqs queue is subscribed to the customer central topic for listening to customer created events
    customerCentralTopic.addSubscription(
      new SqsSubscription(this.customerEventsIngressQueue, {
        rawMessageDelivery: false,
        filterPolicyWithMessageBody: {
          ['detail.metadata.type']: sns.FilterOrPolicy.filter(
            sns.SubscriptionFilter.stringFilter({
              allowlist: ['CustomerCreated'], // we are only interested in CustomerCreated events from this topic
            })
          ),
        },
      })
    );
  }
}
