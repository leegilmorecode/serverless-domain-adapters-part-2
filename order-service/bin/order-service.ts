#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { OrderServiceStatefulStack } from '../stateful/stateful';
import { OrderServiceStatelessStack } from '../stateless/stateless';

// aws domain account lookups
// note: this would typically come from a config service
const enum domainAccountIds {
  'central' = '111111111111',
  'delivery' = '222222222222',
  'orders' = '222222222222',
  'warehouse' = '222222222222',
  'org' = 'o-1234abcd',
}

const app = new cdk.App();
const stateful = new OrderServiceStatefulStack(
  app,
  'OrderServiceStatefulStack',
  {}
);
new OrderServiceStatelessStack(app, 'OrderServiceStatelessStack', {
  ordersTable: stateful.ordersTable,
  customersTable: stateful.customersTable,
  central: domainAccountIds.central,
  customerEventsIngressQueue: stateful.customerEventsIngressQueue,
});
