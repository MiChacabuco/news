import { asset } from '@pulumi/pulumi';
import { cloudwatch, dynamodb, iam, lambda, s3 } from '@pulumi/aws';

import {
  buildAssumeRolePolicy,
  buildAllowedPolicy,
  attachPolicyToRole,
} from '../utils';
import environment from '../../environment';
import { logsPolicy } from '../common';

const { projectName } = environment;

const createPolicy = (
  name: string,
  bucketName: string,
  table: dynamodb.Table
): iam.Policy => {
  const bucketArn = `arn:aws:s3:::${bucketName}`;

  return buildAllowedPolicy(name, [
    {
      Action: ['s3:PutObject', 's3:PutObjectAcl'],
      Resource: bucketArn,
    },
    {
      Action: ['dynamodb:PutItem', 'dynamodb:Query'],
      Resource: table.arn,
    },
  ]);
};

export const createNewsScrapperLambda = (
  bucketName: string,
  table: dynamodb.Table,
  variables = {}
): lambda.Function => {
  const lambdaName = `${projectName}-lambda`;

  // Create Lambda role
  const role = new iam.Role(`${lambdaName}-role`, {
    assumeRolePolicy: buildAssumeRolePolicy(['lambda']),
  });

  // Create and attach policies to role
  const lambdaPolicyName = `${lambdaName}-s3-dynamodb-policy`;
  const lambdaPolicy = createPolicy(lambdaPolicyName, bucketName, table);
  attachPolicyToRole(role, lambdaPolicy, lambdaPolicyName);
  attachPolicyToRole(role, logsPolicy, `${lambdaName}-logs-policy`);

  // Create Lambda function
  const newsScrapperLambda = new lambda.Function(lambdaName, {
    code: new asset.AssetArchive({
      handler: new asset.FileArchive('../app/scrapper'),
      '.': new asset.FileArchive('../app/venv/lib/python3.8/site-packages'),
    }),
    handler: 'handler.run',
    runtime: 'python3.8',
    role: role.arn,
    memorySize: 192,
    timeout: 60,
    environment: {
      variables: {
        BUCKET_NAME: bucketName,
        MEDIA_PATH: 'media/news',
        GOBIERNO_FEED_URL: 'https://chacabuco.gob.ar/feed/',
        LOG_LEVEL: 'INFO',
        ...variables,
      },
    },
  });

  // Trigger scrapper every 5 minutes
  cloudwatch.onSchedule(
    `${projectName}-schedule`,
    'rate(5 minutes)',
    newsScrapperLambda
  );

  return newsScrapperLambda;
};
