import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

interface CustomerServiceStatelessStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  central: string;
}

export class CustomerServiceStatelessStack extends cdk.Stack {
  private eventsStreamQueue: sqs.Queue;
  private table: dynamodb.Table;

  constructor(
    scope: Construct,
    id: string,
    props: CustomerServiceStatelessStackProps
  ) {
    super(scope, id, props);

    const { table, central } = props;

    this.table = table;

    const lambdaPowerToolsConfig = {
      LOG_LEVEL: 'DEBUG',
      POWERTOOLS_LOGGER_LOG_EVENT: 'true',
      POWERTOOLS_LOGGER_SAMPLE_RATE: '1',
      POWERTOOLS_TRACE_ENABLED: 'enabled',
      POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS: 'captureHTTPsRequests',
      POWERTOOLS_SERVICE_NAME: 'customer-domain-service',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'captureResult',
      POWERTOOLS_METRICS_NAMESPACE: 'LJAudio',
    };

    // create the 'customer processor' lambda which reads from the stream fifo queue
    const processStreamLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CustomerProcessStreamLambda', {
        functionName: 'customer-process-stream-lambda',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/customer-process-stream/customer-process-stream.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          CUSTOMER_TOPIC_ARN: `arn:aws:sns:eu-west-1:${central}:customer-domains-topic.fifo`,
        },
      });

    // create the 'crm customer processor' lambda which reads from the s3 bucket and writes to the table on upload
    const customerFileUploadLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CustomerFileUploadLambda', {
        functionName: 'customer-file-upload-lambda',
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          'src/adapters/primary/customer-file-upload-lambda/customer-file-upload-lambda.adapter.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          minify: true,
        },
        environment: {
          ...lambdaPowerToolsConfig,
          TABLE_NAME: this.table.tableName,
        },
      });

    // create our events queue from a dynamodb stream via pipes (our outbox)
    this.eventsStreamQueue = new sqs.Queue(this, 'CustomerEventStreamsQueue', {
      queueName: 'customer-event-stream-queue.fifo',
      fifo: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'CustomerEventStreamsQueueDlq', {
          fifo: true,
          queueName: 'customer-event-stream-queue-dlq.fifo',
        }),
      },
    });

    // allow the lambda to process messages from the queue
    this.eventsStreamQueue.grantConsumeMessages(processStreamLambda);

    // create the pipe role
    const pipeRole = new iam.Role(this, 'PipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });

    this.table.grantStreamRead(pipeRole);
    this.eventsStreamQueue.grantSendMessages(pipeRole);

    // add the eventbridge pipe for the stream
    new pipes.CfnPipe(this, 'CustomersStreamPipe', {
      roleArn: pipeRole.roleArn,
      source: this.table.tableStreamArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: 'LATEST',
          batchSize: 1,
          maximumRetryAttempts: 3,
        },
        filterCriteria: {
          filters: [
            {
              pattern: '{"eventName" : ["INSERT"] }', // we are only interested in raising events for new customers in this example
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

    // ensure our lambda function is invoked from the queue
    processStreamLambda.addEventSource(
      new SqsEventSource(this.eventsStreamQueue, {
        batchSize: 1, // we can set this up to 10, and the default is 10, 1 is essentially one at a time
        maxConcurrency: 50, // how many functions to invoke - max 1K
        reportBatchItemFailures: true,
      })
    );

    // get a reference for the bucket
    const bucket = s3.Bucket.fromBucketName(
      this,
      'S3Bucket',
      'lj-audio-s3-ingress-bucket'
    );

    // ensure our lambda function is invoked when an object is uploaded via the crm system
    // allowing us to parse the json record and persist to our dynamodb table
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(customerFileUploadLambda)
    );

    // ensure the lambda function can read the bucket to access the customer file
    bucket.grantRead(customerFileUploadLambda);

    // ensure the lambda function can write to the database table
    this.table.grantWriteData(customerFileUploadLambda);

    // allow our process stream lambda to write to the customer central topic
    const customerTopic = sns.Topic.fromTopicArn(
      this,
      'CustomersTopic',
      `arn:aws:sns:eu-west-1:${central}:customer-domains-topic.fifo`
    );
    customerTopic.grantPublish(processStreamLambda);
  }
}
