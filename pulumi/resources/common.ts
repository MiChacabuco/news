import { buildAssumeRolePolicy, buildAllowedPolicy } from './utils';
import environment from '../environment';

const { projectName } = environment;

export const lambdaAssumeRolePolicy = buildAssumeRolePolicy(['lambda']);
export const logsPolicy = buildAllowedPolicy(`${projectName}-logs-policy`, [
  {
    Action: [
      'logs:CreateLogGroup',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ],
  },
]);
