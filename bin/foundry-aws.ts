#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundryAwsStack } from '../lib/foundry-aws-stack';
import { configDotenv } from 'dotenv';

configDotenv();
const app = new cdk.App();

new FoundryAwsStack(app, 'FoundryAwsStack', {
  env: {
    account: process.env.ACCOUNT,
    region: process.env.REGION,
  }
});