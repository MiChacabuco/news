import { iam, lambda, dynamodb } from '@pulumi/aws';
import { apigateway } from '@pulumi/awsx';

import { buildAllowedPolicy, attachPolicyToRole } from '../utils';
import { lambdaAssumeRolePolicy } from '../common';
import environment from '../../environment';
// @ts-ignore
import * as news from '../../../app/api';

const { projectName } = environment;
const apiName = `${projectName}-api`;

const createNewsHandler = (
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
  ]);
  attachPolicyToRole(role, policy, policyName);

  return new lambda.CallbackFunction(lambdaName, {
    callback: news.handler,
    runtime: lambda.NodeJS12dXRuntime,
    role,
    environment: {
      variables: {
        REGION: environment.region,
        NEWS_TABLE_NAME: newsTable.name,
        SOURCES_TABLE_NAME: sourcesTable.name,
        MEDIA_URL: '',
      },
    },
  });
};

export const createNewsApi = (
  newsTable: dynamodb.Table,
  sourcesTable: dynamodb.Table
) => {
  const newsEventHandler = createNewsHandler(newsTable, sourcesTable);

  return new apigateway.API(apiName, {
    routes: [
      {
        path: '/news',
        method: 'GET',
        eventHandler: newsEventHandler,
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
