import { getProject, Config } from '@pulumi/pulumi';

const mainConfig = new Config('news');
const awsConfig = new Config('aws');

export default {
  projectName: getProject(),
  region: awsConfig.require('region'),
  bucketName: mainConfig.require('bucket-name'),
};
