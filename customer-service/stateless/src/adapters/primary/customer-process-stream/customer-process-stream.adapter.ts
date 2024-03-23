import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';
import { SQSEvent, SQSRecord } from 'aws-lambda';

import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';
import sqsBatch from '@middy/sqs-partial-batch-failure';
import { logger } from '@shared';
import { customerProcessStreamUseCase } from '@use-cases/customer-process-stream';

const tracer = new Tracer();
const metrics = new Metrics();

// we pull the events off the queue and publish the messages to the orders topic
export const processStreamAdapter = async ({
  Records,
}: SQSEvent): Promise<PromiseSettledResult<SQSRecord>[]> => {
  try {
    // map the sqs events into our event types
    const recordPromises = Records.map(async (record) => {
      // call our use case to perform the event publishing with the event
      return await customerProcessStreamUseCase(record);
    });

    return Promise.allSettled(recordPromises);
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) errorMessage = error.message;
    logger.error(errorMessage);

    metrics.addMetric('CustomerEventProcessorError', MetricUnit.Count, 1);

    throw error;
  }
};

export const handler = middy()
  .use(sqsBatch())
  .handler(processStreamAdapter)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics));
