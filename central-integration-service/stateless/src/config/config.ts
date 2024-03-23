const convict = require('convict');

export const config = convict({
  centralBusName: {
    doc: 'The central eventbridge bus name',
    format: String,
    default: '',
    env: 'CENTRAL_BUS_NAME',
  },
  ordersTopicArn: {
    doc: 'The orders sns topic arn',
    format: String,
    default: '',
    env: 'ORDERS_TOPIC',
  },
  deliveryTopicArn: {
    doc: 'The delivery sns topic arn',
    format: String,
    default: '',
    env: 'DELIVERY_TOPIC',
  },
  warehouseTopicArn: {
    doc: 'The warehouse sns topic arn',
    format: String,
    default: '',
    env: 'WAREHOUSE_TOPIC',
  },
  customerTopicArn: {
    doc: 'The customer sns topic arn',
    format: String,
    default: '',
    env: 'CUSTOMER_TOPIC',
  },
}).validate({ allowed: 'strict' });
