#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { CustomerServiceStatefulStack } from '../stateful/stateful';
import { CustomerServiceStatelessStack } from '../stateless/stateless';

// aws domain account lookups
// note: this would typically come from a config service
const enum domainAccountIds {
  'central' = '111111111111',
}

const app = new cdk.App();
const stateful = new CustomerServiceStatefulStack(
  app,
  'CustomerServiceStatefulStack',
  {}
);
new CustomerServiceStatelessStack(app, 'CustomerServiceStatelessStack', {
  table: stateful.table,
  central: domainAccountIds.central,
});
