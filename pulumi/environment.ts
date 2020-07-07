import { getProject, Config } from '@pulumi/pulumi';

const awsConfig = new Config('aws');

export default {
  projectName: getProject(),
  region: awsConfig.require('region'),
};
