import { iam, lambda, dynamodb } from '@pulumi/aws';
import { apigateway } from '@pulumi/awsx';

import { buildAllowedPolicy, attachPolicyToRole } from '../utils';
import { lambdaAssumeRolePolicy } from '../common';
import environment from '../../environment';
// @ts-ignore
import * as news from '../../../app/api/news';
// @ts-ignore
import * as sources from '../../../app/api/sources';

const { projectName } = environment;
const apiName = `${projectName}-api`;

const createNewsHandler = (newsTable: dynamodb.Table) => {
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
  ]);
  attachPolicyToRole(role, policy, policyName);

  return new lambda.CallbackFunction(
    lambdaName,
    {
      callback: news.handler,
      runtime: lambda.NodeJS12dXRuntime,
      role,
      environment: {
        variables: {
          REGION: environment.region,
          TABLE_NAME: newsTable.name,
          MEDIA_URL: '',
        },
      },
    },
    { ignoreChanges: ['environment'] }
  );
};

const createSourcesHandler = (sourcesTable: dynamodb.Table) => {
  const lambdaName = `${apiName}-sources-lambda`;

  // Create role
  const role = new iam.Role(`${lambdaName}-role`, {
    assumeRolePolicy: lambdaAssumeRolePolicy,
  });

  // Create and attach policy to role
  const policyName = `${lambdaName}-policy`;
  const policy = buildAllowedPolicy(policyName, [
    {
      Action: ['dynamodb:Scan'],
      Resource: sourcesTable.arn,
    },
  ]);
  attachPolicyToRole(role, policy, policyName);

  return new lambda.CallbackFunction(
    lambdaName,
    {
      role,
      runtime: lambda.NodeJS12dXRuntime,
      callback: sources.handler,
      environment: {
        variables: {
          TABLE_NAME: sourcesTable.name,
          MEDIA_URL: '',
        },
      },
    },
    { ignoreChanges: ['environment'] }
  );
};

export const createNewsApi = (
  newsTable: dynamodb.Table,
  sourcesTable: dynamodb.Table
) => {
  const newsEventHandler = createNewsHandler(newsTable);
  const sourcesEventHandler = createSourcesHandler(sourcesTable);

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
      {
        path: '/sources',
        method: 'GET',
        eventHandler: sourcesEventHandler,
      },
    ],
    stageName: 'v1',
    requestValidator: 'PARAMS_ONLY',
  });
};
