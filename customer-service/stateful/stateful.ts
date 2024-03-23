import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

import { Construct } from 'constructs';

export class CustomerServiceStatefulStack extends cdk.Stack {
  public table: dynamodb.Table;
  public bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create a table for the customer domain
    this.table = new dynamodb.Table(this, 'CustomerServiceTable', {
      tableName: 'customer-domain-service-table',
      stream: dynamodb.StreamViewType.NEW_IMAGE, // we use dynamodb streams
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // create the s3 bucket that the CRM solution will push too
    this.bucket = new s3.Bucket(this, 'S3CrmBucket', {
      bucketName: 'lj-audio-s3-ingress-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }
}
