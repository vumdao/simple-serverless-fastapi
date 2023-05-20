import { App } from 'aws-cdk-lib';
import { SimpleFastApiServerless } from './apigw-lambda';
import { devEnv } from './shared/environment';
import { TagsProp } from './shared/tagging';

const app = new App();

new SimpleFastApiServerless(app, 'SimpleFastApiServerless', devEnv, {env: devEnv, tags: TagsProp('fastapi', devEnv)});

app.synth();