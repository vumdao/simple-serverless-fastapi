import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  ConnectionType,
  Integration,
  IntegrationOptions,
  IntegrationType,
  MethodOptions,
  Model,
  Resource,
  RestApi,
  VpcLink,
} from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  HostedZone,
  RecordSet,
  RecordTarget,
  RecordType,
} from 'aws-cdk-lib/aws-route53';
import { ApiGatewayDomain } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import {
  NLB_VI_DEV_ARN,
} from '../../shared/ap-northeast-2/constants';
import { NLB_VI_QA_ARN } from '../../shared/ap-south-1/constants';
import {
  NLB_VPCLINK_VI_PORT,
  VC_DEV_HOSTED_ZONE_ID,
  VC_DEV_ZONE_NAME,
  VC_HOSTED_ZONE_ID,
  VC_ZONE_NAME,
} from '../../shared/global/constants';
import { EnvironmentConfig } from '../../shared/global/environment';

export interface IdentityApiGwProps extends StackProps {
  cognitoUserPool: any;
  eksVpc: IVpc;
}

export interface IntegrationSource {
  src: any;
  path: string;
}

/**
 * Application API Gateway sends requests to Vincere identity service through VPC_LINK endpoint
 * The VPC link with target NLB which is not in this CDK stack but from CDK8S so there's tricky here: Enter to this stack only after creating the NLB and import it into this stack
 * Nested stack: ACM
 */
export class IdentityApiGw extends Stack {
  constructor(
    scope: Construct,
    id: string,
    reg: EnvironmentConfig,
    envName: string,
    acmArn: string,
    props: IdentityApiGwProps,
  ) {
    super(scope, id, props);

    const prefix = `${reg.pattern}-vc-${reg.stage}-${envName}`;

    const corsPreflight = {
      statusCode: 200,
      allowOrigins: ['*'],
      allowHeaders: ['*'],
      allowMethods: ['*'],
    };

    let _arn = reg.vcNlbViArn;
    if (reg.vcNlbViArn) {
      _arn = reg.vcNlbViArn;
    } else if (NLB_VI_DEV_ARN[envName]) {
      _arn = NLB_VI_DEV_ARN[envName];
    } else if (envName === 'qa') {
      _arn = NLB_VI_QA_ARN;
    } else {
      return;
    }

    const _nlb = NetworkLoadBalancer.fromLookup(this, `${prefix}-apigw-nlb`, {
      loadBalancerArn: _arn,
    });

    const apigwVpcLink = new VpcLink(this, `${prefix}-apigw-vpclink`, {
      description:
        'Vpclink for communication between identity APIGW and service identity',
      vpcLinkName: `${prefix}-app-api`,
      targets: [_nlb],
    });

    const api = new RestApi(this, `${prefix}-apigw`, {
      restApiName: `${prefix}-api`,
      deployOptions: { stageName: 'AuthStage' },
    });

    let _zoneId = '';
    let _zoneName = '';
    if (reg.stage === 'd1') {
      _zoneId = VC_DEV_HOSTED_ZONE_ID;
      _zoneName = VC_DEV_ZONE_NAME;
    } else {
      _zoneId = VC_HOSTED_ZONE_ID;
      _zoneName = VC_ZONE_NAME;
    }
    const apiDomain = api.addDomainName(`${prefix}-apigw-domain`, {
      domainName: `id-${envName}.${_zoneName}`,
      certificate: Certificate.fromCertificateArn(
        this,
        'CertificateArn',
        acmArn,
      ),
    });

    new RecordSet(this, `${prefix}-api-domain`, {
      recordName: `id-${envName}`,
      ttl: Duration.minutes(1),
      zone: HostedZone.fromHostedZoneAttributes(this, `${prefix}-hosted-zone`, {
        hostedZoneId: _zoneId,
        zoneName: _zoneName,
      }),
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
      recordType: RecordType.A,
    });

    const apiAddResource = function (sourceName: string): Resource {
      const proxyMethod: MethodOptions = {
        methodResponses: [
          {
            statusCode: '200',
            responseModels: { 'application/json': Model.EMPTY_MODEL },
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        requestParameters: { 'method.request.path.proxy': true },
      };

      const proxyIntOption: IntegrationOptions = {
        connectionType: ConnectionType.VPC_LINK,
        vpcLink: apigwVpcLink,
        integrationResponses: [{ statusCode: '200' }],
        requestParameters: {
          'integration.request.path.proxy': 'method.request.path.proxy',
        },
        cacheKeyParameters: ['method.request.path.proxy'],
      };

      const proxyHttpIntOption = new Integration({
        type: IntegrationType.HTTP_PROXY,
        integrationHttpMethod: 'ANY',
        uri: `http://${_nlb.loadBalancerDnsName}:${NLB_VPCLINK_VI_PORT}/${sourceName}/{proxy}`,
        options: proxyIntOption,
      });

      const resource = api.root.addResource(sourceName);
      const proxyResouce = resource.addProxy({
        anyMethod: true,
        defaultMethodOptions: proxyMethod,
        defaultIntegration: proxyHttpIntOption,
      });
      proxyResouce.addCorsPreflight(corsPreflight);

      return resource;
    };

    for (var src of ['credentials', 'oidc']) {
      apiAddResource(src);
    }

    // Oauth2 with Authorizer
    const apiAuthorizer = new CognitoUserPoolsAuthorizer(
      this,
      `${prefix}-apigw-authorizer`,
      {
        authorizerName: `${envName}-id-auth-pool`,
        cognitoUserPools: [props.cognitoUserPool],
        identitySource: 'method.request.header.id-token',
      },
    );

    const apiAddGetMethod = function (_src: IntegrationSource) {
      const getIntOption: IntegrationOptions = {
        integrationResponses: [{ statusCode: '200' }],
        connectionType: ConnectionType.VPC_LINK,
        vpcLink: apigwVpcLink,
      };

      const getIntegration = new Integration({
        type: IntegrationType.HTTP_PROXY,
        integrationHttpMethod: 'GET',
        uri: `http://${_nlb.loadBalancerDnsName}:${NLB_VPCLINK_VI_PORT}/${_src.path}`,
        options: getIntOption,
      });

      const getMethodOption: MethodOptions = {
        methodResponses: [
          {
            statusCode: '200',
            responseModels: { 'application/json': Model.EMPTY_MODEL },
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        authorizationType: AuthorizationType.COGNITO,
        authorizer: apiAuthorizer,
      };

      _src.src.addMethod('GET', getIntegration, getMethodOption);
      _src.src.addCorsPreflight(corsPreflight);
    };

    const oauth2Resource = apiAddResource('oauth2');
    const oauth2User = oauth2Resource.addResource('user');
    const oauth2UserTimetemp = oauth2User.addResource('timetemp');
    for (var source of [
      { src: oauth2User, path: 'oauth2/user' },
      { src: oauth2UserTimetemp, path: 'oauth2/user/timetemp' },
    ]) {
      apiAddGetMethod(source);
    }
  }
}
