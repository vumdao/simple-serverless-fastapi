import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EnvironmentConfig } from "./shared/environment";
import { PROJECT_OWNER, SIMFLEXCLOUD_ZONE_ID, SIMFLEXCLOUD_ZONE_NAME } from "./shared/constants";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { join } from "path";
import { Integration, IntegrationType, MethodOptions, Model, RestApi, UsagePlan } from "aws-cdk-lib/aws-apigateway";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, RecordSet, RecordTarget, RecordType } from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";

export class SimpleFastApiServerless extends Stack {
  constructor(scope: Construct, id: string, reg: EnvironmentConfig, props?: StackProps) {
    super(scope, id, props);

    const prefix = `${reg.pattern}-${PROJECT_OWNER}-${reg.stage}-fastapi`;

    const lambdaRole = new Role(this, `${prefix}-lambda-role`, {
      roleName: prefix,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')]
    });

    new PythonFunction(this, `${prefix}-lambda`, {
      functionName: prefix,
      role: lambdaRole,
      runtime: Runtime.PYTHON_3_9,
      logRetention: RetentionDays.ONE_DAY,
      logRetentionRole: lambdaRole,
      entry: join(__dirname, 'lambda-handler'),
      index: 'main.py',
    });

    const apigw = new RestApi(this, `${prefix}-apigw`, {
      restApiName: `${prefix}-fast-api`,
      deployOptions: { stageName: 'AppAPI' },
      cloudWatchRole: false,
    });

    /**
     * Usage plan
     */
    new UsagePlan(this, `${prefix}-usage-plan`, {
      name: 'fastApi-test',
      apiStages: [{
        api: apigw,
        stage: apigw.deploymentStage,
      }]
    });

    /**
     * APIGW integration
     */
    //const lambdaInt = new LambdaIntegration(lambdaFunc, {
    //  integrationResponses: [{ statusCode: '200' }]
    //});

    /**
     * Method option
     */
    const methodOptions = function (
      apiKeyRequired?: boolean
    ): MethodOptions {
      return {
        methodResponses: [
          {
            statusCode: '200',
            responseModels: { 'application/json': Model.EMPTY_MODEL },
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        apiKeyRequired: (apiKeyRequired === undefined) ? true : apiKeyRequired,
        requestParameters: { "method.request.path.proxy": true },
      }
    }

    /**
     * Root path /
     * This proxy route path serves API Docs so it must not require API key
     */
    //apigw.root.addProxy({
    //  anyMethod: true,
    //  defaultIntegration: lambdaInt,
    //  defaultMethodOptions: methodOptions(false)
    //});

    /**
     * /api/v1/*
     */
    //const apiSrc = apigw.root.addResource('api');
    //const apiV1Src = apiSrc.addResource('v1');
    //apiV1Src.addProxy({
    //  anyMethod: true,
    //  defaultIntegration: lambdaInt,
    //  defaultMethodOptions: methodOptions(),
    //});

    /**
     * /chat_gpt/
     */
    //const chatGptSrc = apigw.root.addResource('chat_gpt');
    //chatGptSrc.addProxy({
    //  anyMethod: true,
    //  defaultIntegration: lambdaInt,
    //  defaultMethodOptions: methodOptions(),
    //});

    /**
     * HTTP integration
     */
    const httpInt: any = function (uriPath: string) {
      return new Integration({
        type: IntegrationType.HTTP_PROXY,
        integrationHttpMethod: "ANY",
        uri: `http://18.169.10.197:8000/${uriPath}`,
        options: {
          integrationResponses: [{ statusCode: "200" }],
          requestParameters: {
            "integration.request.path.proxy": "method.request.path.proxy",
          },
          cacheKeyParameters: ["method.request.path.proxy"],
        },
      })
    };

    apigw.root.addProxy({
      anyMethod: true,
      defaultIntegration: httpInt('{proxy}'),
      defaultMethodOptions: methodOptions(false),
    });

    const apiSrc = apigw.root.addResource('api');
    const apiV1Src = apiSrc.addResource('v1');
    apiV1Src.addProxy({
      anyMethod: true,
      defaultIntegration: httpInt('api/v1/{proxy}'),
      defaultMethodOptions: methodOptions(),
    });

    /**
     * Custom domain
     */
    const hostedZone = HostedZone.fromHostedZoneAttributes(this, `${prefix}-hosted-zone`, {
      hostedZoneId: SIMFLEXCLOUD_ZONE_ID,
      zoneName: SIMFLEXCLOUD_ZONE_NAME,
    });

    const acm = new Certificate(this, `${prefix}-acm`, {
      domainName: SIMFLEXCLOUD_ZONE_NAME,
      subjectAlternativeNames: [`*.${SIMFLEXCLOUD_ZONE_NAME}`],
      validation: CertificateValidation.fromDns(hostedZone)
    });

    const apiDomain = apigw.addDomainName(`${prefix}-apigw-domain`, {
      domainName: `chatgpt.${SIMFLEXCLOUD_ZONE_NAME}`,
      certificate: Certificate.fromCertificateArn(
        this,
        'CertificateArn',
        acm.certificateArn,
      ),
    });

    new RecordSet(this, `${prefix}-api-domain`, {
      recordName: 'chatgpt',
      ttl: Duration.minutes(1),
      zone: hostedZone,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
      recordType: RecordType.A,
    });
  }
}