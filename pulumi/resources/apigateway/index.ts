import { asset } from '@pulumi/pulumi';
import { iam, lambda, dynamodb } from '@pulumi/aws';
import { apigateway } from '@pulumi/awsx';

import { buildAllowedPolicy, attachPolicyToRole, warmLambda } from '../utils';
import { lambdaAssumeRolePolicy, logsPolicy } from '../common';
import environment from '../../environment';

const { projectName } = environment;
const apiName = `${projectName}-api`;

const createNewsLambda = (
  newsTable: dynamodb.Table,
  sourcesTable: dynamodb.Table
) => {
  const lambdaName = `${apiName}-news-lambda`;

  // Create role
  const role = new iam.Role(`${lambdaName}-role`, {
    assumeRolePolicy: lambdaAssumeRolePolicy,
  });

  // Create and attach policy to role
  const policyName = `${lambdaName}-policy`;
  const policy = buildAllowedPolicy(policyName, [
    {
      Action: ['dynamodb:Query'],
      Resource: newsTable.arn,
    },
    {
      Action: ['dynamodb:Scan'],
      Resource: sourcesTable.arn,
    },
    {
      Action: ['lambda:InvokeFunction'],
    },
  ]);
  attachPolicyToRole(role, logsPolicy, `${lambdaName}-logs-policy`);
  attachPolicyToRole(role, policy, policyName);

  return new lambda.Function(lambdaName, {
    code: new asset.AssetArchive({
      '.': new asset.FileArchive('../app/api'),
    }),
    handler: 'index.handler',
    runtime: lambda.NodeJS12dXRuntime,
    timeout: 10,
    role: role.arn,
    environment: {
      variables: {
        REGION: environment.region,
        NEWS_TABLE_NAME: newsTable.name,
        SOURCES_TABLE_NAME: sourcesTable.name,
        DEFAULT_LIMIT: '5',
        MAX_LIMIT: '10',
        MEDIA_URL: '',
      },
    },
  });
};

export const createNewsApi = (
  newsTable: dynamodb.Table,
  sourcesTable: dynamodb.Table
) => {
  const newsLambda = createNewsLambda(newsTable, sourcesTable);
  // Warm the Lambda
  warmLambda(`${projectName}-api`, newsLambda);

  return new apigateway.API(apiName, {
    routes: [
      {
        path: '/news',
        method: 'GET',
        eventHandler: newsLambda,
        requiredParameters: [
          {
            in: 'query',
            name: 'Source',
          },
        ],
      },
    ],
    stageName: 'v1',
    requestValidator: 'PARAMS_ONLY',
  });
};
