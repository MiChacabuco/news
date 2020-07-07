import { asset } from '@pulumi/pulumi';
import { cloudwatch, iam, lambda } from '@pulumi/aws';

import { buildAssumeRolePolicy, buildAllowedPolicy } from '../utils';
import environment from '../../environment';

const { projectName } = environment;

export const createNewsLambda = (variables = {}): lambda.Function => {
  // Create Lambda role
  const role = new iam.Role(`${projectName}-lambda-role`, {
    assumeRolePolicy: buildAssumeRolePolicy(['lambda']),
  });

  // Create Lambda policy
  const policy = buildAllowedPolicy(`${projectName}-lambda-policy`, [
    'logs:CreateLogGroup',
    'logs:CreateLogStream',
    'logs:PutLogEvents',
    's3:PutObject',
    's3:PutObjectAcl',
    'dynamodb:PutItem',
    'dynamodb:Query',
  ]);

  // Attach policy to role
  new iam.RolePolicyAttachment(`${projectName}-lambda-role-policy-attachment`, {
    role,
    policyArn: policy.arn,
  });

  const newsScrapperLambda = new lambda.Function(`${projectName}-lambda`, {
    code: new asset.AssetArchive({
      handler: new asset.FileArchive('../app/handler'),
      '.': new asset.FileArchive('../app/venv/lib/python3.8/site-packages'),
    }),
    handler: 'handler.run',
    runtime: 'python3.8',
    role: role.arn,
    memorySize: 192,
    timeout: 60,
    environment: {
      variables: {
        BUCKET_NAME: 'michacabuco',
        MEDIA_PATH: 'media/news',
        GOBIERNO_FEED_URL: 'https://chacabuco.gob.ar/feed/',
        LOG_LEVEL: 'INFO',
        ...variables,
      },
    },
  });

  // Trigger scrapper every 10 minutes
  cloudwatch.onSchedule(
    `${projectName}-schedule`,
    'rate(10 minutes)',
    newsScrapperLambda
  );

  return newsScrapperLambda;
};
