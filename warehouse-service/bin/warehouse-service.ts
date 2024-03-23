#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { WarehouseServiceStatefulStack } from '../stateful/stateful';
import { WarehouseServiceStatelessStack } from '../stateless/stateless';

// aws domain account lookups
// note: this would typically come from a config service
const enum domainAccountIds {
  'central' = '111111111111',
  'delivery' = '222222222222',
  'orders' = '222222222222',
  'warehouse' = '222222222222',
  'customer' = '222222222222',
  'org' = 'o-12345abcdef',
}

const app = new cdk.App();
const stateful = new WarehouseServiceStatefulStack(
  app,
  'WarehouseServiceStatefulStack',
  {}
);
new WarehouseServiceStatelessStack(app, 'WarehouseServiceStatelessStack', {
  eventsEgressQueue: stateful.eventsEgressQueue,
  central: domainAccountIds.central,
});
