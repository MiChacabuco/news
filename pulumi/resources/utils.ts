import { iam } from '@pulumi/aws';

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
  Action: string[],
  Resource = '*'
): iam.Policy => {
  return new iam.Policy(name, {
    policy: {
      Version,
      Statement: [
        {
          Effect: 'Allow',
          Action,
          Resource,
        },
      ],
    },
  });
};
