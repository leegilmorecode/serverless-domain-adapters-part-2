import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { Customer } from '@dto/customer';
import { logger } from '@shared';

const s3Client = new S3Client();

export async function getCustomerFromFile(
  bucketName: string,
  objectKey: string
): Promise<Customer> {
  try {
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
    logger.info(`Bucket: ${bucketName}, key: ${objectKey}`);

    const { Body: body } = await s3Client.send(getObjectCommand);

    if (!body) {
      throw new Error('empty body returned from S3 bucket');
    }

    const bodyString = await body.transformToString();

    const customerData = JSON.parse(bodyString);

    logger.info(`customer record from bucket: ${JSON.stringify(customerData)}`);

    const customer: Customer = {
      customerId: customerData.customerId,
      customerName: customerData.customerName,
      email: customerData.email,
      address: customerData.address,
      phone: customerData.phone,
    };

    return customer;
  } catch (error) {
    console.error('error retrieving and parsing file from S3:', error);
    throw error;
  }
}
