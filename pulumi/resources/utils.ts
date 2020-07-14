import { iam, cloudwatch, lambda } from '@pulumi/aws';

const Version = '2012-10-17'; // Policy document version

export const buildAssumeRolePolicy = (
  services: string[]
): iam.PolicyDocument => ({
  Version,
  Statement: [
    {
      Effect: 'Allow',
      Principal: {
        Service: services.map((service) => `${service}.amazonaws.com`),
      },
      Action: 'sts:AssumeRole',
    },
  ],
});

export const buildAllowedPolicy = (
  name: string,
  statements: Partial<iam.PolicyStatement>[]
): iam.Policy => {
  return new iam.Policy(name, {
    policy: {
      Version,
      Statement: statements.map((s) => ({
        Effect: 'Allow',
        Resource: '*',
        ...s,
      })),
    },
  });
};

export const attachPolicyToRole = (
  role: iam.Role,
  policy: iam.Policy,
  policyName: string
) => {
  return new iam.RolePolicyAttachment(`${policyName}-attachment`, {
    role,
    policyArn: policy.arn,
  });
};

export const warmLambda = (name: string, func: lambda.Function) => {
  name = `${name}-warmer`;
  const eventRule = new cloudwatch.EventRule(`${name}-rule`, {
    scheduleExpression: 'rate(5 minutes)',
  });
  new cloudwatch.EventTarget(`${name}-target`, {
    arn: func.arn,
    rule: eventRule.name,
    input: JSON.stringify({ warmer: true }),
  });
  new lambda.Permission(`${name}-permission`, {
    function: func,
    action: 'lambda:InvokeFunction',
    principal: 'events.amazonaws.com',
    sourceArn: eventRule.arn,
  });
};
