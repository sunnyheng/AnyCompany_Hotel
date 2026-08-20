import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

export interface StepUpAuthStackProps extends cdk.StackProps {
  /** Booking amount above which step-up verification is required. */
  readonly stepUpThreshold: number;
  /** Verified SES sender for OTP emails; omit to fall back to CloudWatch Logs delivery (demo only). */
  readonly sesFromAddress?: string;
  /** Origin allowed to call the booking API from the browser. */
  readonly webOrigin: string;
}

const REPO_ROOT = path.join(__dirname, '..', '..');
const BACKEND_SRC = path.join(REPO_ROOT, 'backend', 'src');

export class StepUpAuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StepUpAuthStackProps) {
    super(scope, id, props);

    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(REPO_ROOT, 'backend'),
      depsLockFilePath: path.join(REPO_ROOT, 'backend', 'package-lock.json'),
    };

    // --- Cognito custom auth triggers -------------------------------------

    const defineAuthChallenge = new NodejsFunction(this, 'DefineAuthChallenge', {
      ...lambdaDefaults,
      entry: path.join(BACKEND_SRC, 'define-auth-challenge.js'),
      description: 'CUSTOM_AUTH state machine: one OTP challenge, 3 attempts max',
    });

    const createAuthChallenge = new NodejsFunction(this, 'CreateAuthChallenge', {
      ...lambdaDefaults,
      entry: path.join(BACKEND_SRC, 'create-auth-challenge.js'),
      description: 'Generates and delivers the step-up OTP',
      environment: props.sesFromAddress ? { SES_FROM_ADDRESS: props.sesFromAddress } : {},
    });

    if (props.sesFromAddress) {
      // Scoped to the single sender identity instead of ses:* on all resources.
      createAuthChallenge.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [
            cdk.Arn.format(
              { service: 'ses', resource: 'identity', resourceName: props.sesFromAddress },
              this,
            ),
          ],
        }),
      );
    }

    const verifyAuthChallenge = new NodejsFunction(this, 'VerifyAuthChallenge', {
      ...lambdaDefaults,
      entry: path.join(BACKEND_SRC, 'verify-auth-challenge.js'),
      description: 'Constant-time OTP verification',
    });

    // --- User pool ---------------------------------------------------------

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'anycompany-hotel-stepup-reference',
      // Visitors can register with their own email (verified by a code sent
      // through Cognito's default mail channel); scripts/create-demo-user.sh
      // still seeds the shared demo account.
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: 'AnyCompany Hotels — your verification code',
        emailBody: 'Your AnyCompany Hotels verification code is {####}.',
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        defineAuthChallenge,
        createAuthChallenge,
        verifyAuthChallengeResponse: verifyAuthChallenge,
      },
      // Reference/demo stack: allow clean teardown in evaluation accounts.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'stepup-demo-web',
      authFlows: {
        userPassword: true, // primary sign-in from the SPA
        custom: true, // CUSTOM_AUTH step-up flow
      },
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1),
      preventUserExistenceErrors: true,
    });

    // --- Bookings table ----------------------------------------------------

    const table = new dynamodb.Table(this, 'BookingsTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Demo UI hosting: CloudFront in front of a fully private S3 origin --
    // The bucket blocks all public access (all four settings) and is readable
    // only by this distribution via Origin Access Control; viewers reach the
    // static assets exclusively through CloudFront over HTTPS.

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Reference/demo stack: allow clean teardown in evaluation accounts.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'AnyCompany Hotels step-up auth demo UI',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      // SPA routing: a private-origin miss surfaces as 403 from S3, so map
      // both 403 and 404 back to index.html.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });
    const webUrl = `https://${distribution.distributionDomainName}`;

    // --- Booking API ---------------------------------------------------------

    const bookingFn = new NodejsFunction(this, 'BookingApi', {
      ...lambdaDefaults,
      entry: path.join(BACKEND_SRC, 'booking-api.js'),
      description: 'Booking API enforcing the step-up policy',
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        STEP_UP_THRESHOLD: String(props.stepUpThreshold),
        STEP_UP_MAX_AGE_SECONDS: '300',
      },
    });
    // Least privilege: the handler only ever puts and queries its own items.
    table.grant(bookingFn, 'dynamodb:PutItem', 'dynamodb:Query');

    const httpApi = new apigwv2.HttpApi(this, 'BookingHttpApi', {
      apiName: 'anycompany-hotel-stepup-bookings',
      corsPreflight: {
        // The hosted demo UI plus the configurable local-dev origin.
        allowOrigins: [webUrl, props.webOrigin],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ['authorization', 'content-type', 'x-step-up-token'],
        maxAge: cdk.Duration.minutes(10),
      },
    });

    const authorizer = new HttpUserPoolAuthorizer('UserPoolAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });
    const integration = new HttpLambdaIntegration('BookingIntegration', bookingFn);

    httpApi.addRoutes({
      path: '/bookings',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    });

    // --- Outputs consumed by web/.env and scripts --------------------------

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'StepUpThreshold', { value: String(props.stepUpThreshold) });
    new cdk.CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });
    new cdk.CfnOutput(this, 'WebDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'WebUrl', { value: webUrl });
  }
}
