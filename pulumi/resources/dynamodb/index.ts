import { dynamodb } from '@pulumi/aws';

import environment from '../../environment';

const { projectName } = environment;

export const createNewsTable = (): dynamodb.Table => {
  return new dynamodb.Table(`${projectName}-table`, {
    attributes: [
      { name: 'Source', type: 'S' },
      { name: 'CreatedAt', type: 'N' },
    ],
    hashKey: 'Source',
    rangeKey: 'CreatedAt',
    writeCapacity: 5,
    readCapacity: 5,
  });
};
