import { createCustomer } from '@adapters/secondary';
import { getCustomerFromFile } from '@adapters/secondary/customer-from-file';
import { logger } from '@shared';
import { S3EventRecord } from 'aws-lambda';

export async function customerFileUploadUseCase(
  record: S3EventRecord
): Promise<void> {
  logger.info(`record: ${JSON.stringify(record)}`);

  const bucketName = record.s3.bucket.name;
  const objectKey = record.s3.object.key;

  // get the customer from the file
  // note: for an example only we will have one customer per file
  const customer = await getCustomerFromFile(bucketName, objectKey);

  logger.info(
    `writing the customer: ${JSON.stringify(customer)} to the database`
  );

  // create the database record
  await createCustomer(customer);
}
