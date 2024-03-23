const convict = require('convict');

export const config = convict({
  customersTableName: {
    doc: 'The orders table name',
    format: String,
    default: '',
    env: 'TABLE_NAME',
  },
  customerTopicArn: {
    doc: 'The customer tpopic arn',
    format: String,
    default: '',
    env: 'CUSTOMER_TOPIC_ARN',
  },
}).validate({ allowed: 'strict' });
