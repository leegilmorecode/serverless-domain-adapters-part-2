#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { CentralIntegrationServiceStatefulStack } from '../stateful/stateful';
import { CentralIntegrationServiceStatelessStack } from '../stateless/stateless';

const app = new cdk.App();

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

const stateful = new CentralIntegrationServiceStatefulStack(
  app,
  'CentralIntegrationServiceStatefulStack',
  {
    org: domainAccountIds.org,
    central: domainAccountIds.central,
    orders: domainAccountIds.orders,
    delivery: domainAccountIds.delivery,
    warehouse: domainAccountIds.warehouse,
    customer: domainAccountIds.customer,
  }
);
new CentralIntegrationServiceStatelessStack(
  app,
  'CentralIntegrationServiceStatelessStack',
  {
    ordersTopic: stateful.ordersTopic,
    warehouseTopic: stateful.warehouseTopic,
    deliveryTopic: stateful.deliveryTopic,
    customerTopic: stateful.customerTopic,
    bus: stateful.bus,
  }
);
