import { dynamodb } from '@pulumi/aws';

import environment from '../../environment';

const { projectName } = environment;

export const createNewsTable = (): dynamodb.Table => {
  const hashKey = 'Source';
  const rangeKey = 'CreatedAt';

  return new dynamodb.Table(`${projectName}-news-table`, {
    attributes: [
      { name: hashKey, type: 'S' },
      { name: rangeKey, type: 'N' },
    ],
    hashKey,
    rangeKey,
    writeCapacity: 5,
    readCapacity: 5,
  });
};

export const createNewsSourcesTable = (): dynamodb.Table => {
  const hashKey = 'Id';
  return new dynamodb.Table(`${projectName}-sources-table`, {
    attributes: [{ name: hashKey, type: 'S' }],
    hashKey,
    writeCapacity: 1,
    readCapacity: 5,
  });
};
