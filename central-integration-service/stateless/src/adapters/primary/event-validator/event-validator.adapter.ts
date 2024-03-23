import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';
import { errorHandler, logger, schemaValidator } from '@shared';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { Event } from '@dto/event';
import { ValidationError } from '@errors/validation-error';
import middy from '@middy/core';
import { eventValidatorUseCase } from '@use-cases/event-validator';
import { schema } from './event-validator.schema';

const tracer = new Tracer();
const metrics = new Metrics();

export const eventValidatorAdapter = async ({
  body,
}: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!body) throw new ValidationError('no payload body');

    const event = JSON.parse(body) as Event;

    // basic validation that the event is the correct shape
    // coming through api gateway as a first line of defence
    // not the payload validation per domain and event type
    schemaValidator(schema, event);

    // publish the event to the correct sns fifo topic
    const created: Event = await eventValidatorUseCase(event);

    metrics.addMetric('SuccessfulEventCreated', MetricUnit.Count, 1);

    return {
      statusCode: 201,
      body: JSON.stringify(created),
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) errorMessage = error.message;
    logger.error(errorMessage);

    metrics.addMetric('EventValidatorError', MetricUnit.Count, 1);

    return errorHandler(error);
  }
};

export const handler = middy(eventValidatorAdapter)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics));
