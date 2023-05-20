import { LOCATION, OWNER, SERVICE, STACK_NAME, STAGE } from './constants';
import { EnvironmentConfig } from './environment';

export function TagsProp(serviceName: string, envConf: EnvironmentConfig) {
  const tags: any = {
    [STACK_NAME]: `${envConf.pattern}-simflexcloud-${envConf.stage}-${serviceName}`,
    [SERVICE]: serviceName,
    [LOCATION]: envConf.pattern,
    [OWNER]: envConf.owner,
    [STAGE]: envConf.stage,
  };

  return tags;
}
