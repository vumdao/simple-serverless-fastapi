import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.79.1',
  defaultReleaseBranch: 'main',
  name: 'simple-serverless-fastapi',
  projenrcTs: true,

  deps: [
    '@aws-cdk/aws-apigatewayv2-alpha',
    '@aws-cdk/aws-apigatewayv2-integrations-alpha',
    '@aws-cdk/aws-lambda-python-alpha',
    '@aws-community/arch-dia',
  ],
});
const dotEnvFile = '.env';
project.gitignore.addPatterns(dotEnvFile);
project.gitignore.addPatterns('node_modules');

project.synth();