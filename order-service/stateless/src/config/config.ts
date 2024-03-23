const convict = require('convict');

export const config = convict({
  ordersTableName: {
    doc: 'The orders table name',
    format: String,
    default: '',
    env: 'ORDERS_TABLE_NAME',
  },
  customersTableName: {
    doc: 'The customers table name',
    format: String,
    default: '',
    env: 'CUSTOMERS_TABLE_NAME',
  },
  ordersTopicArn: {
    doc: 'The orders topic arn',
    format: String,
    default: '',
    env: 'ORDERS_TOPIC_ARN',
  },
}).validate({ allowed: 'strict' });
