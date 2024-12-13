#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundryAwsStack } from '../lib/foundry-aws-stack';
import { configDotenv } from 'dotenv';
import { SharedStack } from '../lib/shared-stack';

configDotenv();
const app = new cdk.App();

const shared = new SharedStack(app, 'SharedStack', {
  env: {
    account: process.env.ACCOUNT,
    region: process.env.REGION,
  },
});

const foundry = new FoundryAwsStack(app, 'FoundryAwsStack', {
  env: {
    account: process.env.ACCOUNT,
    region: process.env.REGION,
  },
  vpc: shared.vpc,
  eip: shared.eip,
  s3: shared.s3,
});

foundry.addDependency(shared);