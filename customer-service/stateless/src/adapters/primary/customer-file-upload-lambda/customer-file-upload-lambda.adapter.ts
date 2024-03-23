import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';

import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';
import { logger } from '@shared';
import { customerFileUploadUseCase } from '@use-cases/customer-file-upload-processor';
import { S3Event } from 'aws-lambda';

const tracer = new Tracer();
const metrics = new Metrics();

// we parse the crm customer uploads and write to the database table
export const processUploadAdapter = async ({
  Records,
}: S3Event): Promise<void> => {
  try {
    for (const record of Records) {
      await customerFileUploadUseCase(record);
    }

    metrics.addMetric(
      'CustomerFileUploadProcessorSuccess',
      MetricUnit.Count,
      1
    );
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) errorMessage = error.message;
    logger.error(errorMessage);

    metrics.addMetric('CustomerFileUploadProcessorError', MetricUnit.Count, 1);

    throw error;
  }
};

export const handler = middy()
  .handler(processUploadAdapter)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics));
