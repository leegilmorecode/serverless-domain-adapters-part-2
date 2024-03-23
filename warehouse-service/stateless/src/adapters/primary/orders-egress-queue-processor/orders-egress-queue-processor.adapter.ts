import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';
import { SQSEvent, SQSRecord } from 'aws-lambda';

import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';
import sqsBatch from '@middy/sqs-partial-batch-failure';
import { logger } from '@shared';
import { ordersEgressQueueProcessorUseCase } from '@use-cases/orders-egress-queue-processor';

const tracer = new Tracer();
const metrics = new Metrics();

// we pull the events off the queue and call our third party WMS system.
export const eventProcessorAdapter = async ({
  Records,
}: SQSEvent): Promise<PromiseSettledResult<SQSRecord>[]> => {
  try {
    const recordPromises = Records.map(async (record) => {
      return await ordersEgressQueueProcessorUseCase(record);
    });

    return Promise.allSettled(recordPromises);
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) errorMessage = error.message;
    logger.error(errorMessage);

    metrics.addMetric(
      'OrdersEventWarehouseProcessorError',
      MetricUnit.Count,
      1
    );

    throw error;
  }
};

export const handler = middy()
  .use(sqsBatch())
  .handler(eventProcessorAdapter)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics));
