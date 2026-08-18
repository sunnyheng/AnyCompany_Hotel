#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StepUpAuthStack } from '../lib/step-up-auth-stack';

const app = new cdk.App();

new StepUpAuthStack(app, 'AnyCompanyHotelStepUpAuth', {
  description:
    'AnyCompany Hotels step-up authentication reference: Cognito custom auth challenge (OTP) enforced by a booking API',
  // Configuration knobs, overridable per deployment:
  //   cdk deploy -c stepUpThreshold=1000 -c sesFromAddress=no-reply@example.com \
  //              -c webOrigin=https://demo.example.com
  stepUpThreshold: Number(app.node.tryGetContext('stepUpThreshold') ?? 500),
  sesFromAddress: app.node.tryGetContext('sesFromAddress'),
  webOrigin: app.node.tryGetContext('webOrigin') ?? 'http://localhost:5173',
});
