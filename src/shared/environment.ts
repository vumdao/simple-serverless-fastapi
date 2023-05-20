import { Environment } from 'aws-cdk-lib';
import * as constant from './constants';


export interface EnvironmentConfig extends Environment {
  pattern: string;
  envTag: string;
  stage: string;
  owner: string;
};

export const devEnv: EnvironmentConfig = {
  pattern: 'sin',
  envTag: constant.DEV_ENV_TAG,
  stage: constant.DEV_ENV_STAGE,
  account: constant.CDK_DEFAULT_ACCOUNT,
  region: constant.CDK_DEFAULT_REGION,
  owner: 'development',
};
