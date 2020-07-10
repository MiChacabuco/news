import { createNewsApi } from './resources/apigateway';
import { createNewsTable, createNewsSourcesTable } from './resources/dynamodb';
import { createNewsLambda } from './resources/lambda';

// Create the news tables
const newsTable = createNewsTable();
const newsSourcesTable = createNewsSourcesTable();
// Create the news API Gateway
const { restApi, deployment } = createNewsApi(
  newsTable.name,
  newsSourcesTable.name
);
// Create the news Lambda
const newsLambda = createNewsLambda({ TABLE_NAME: newsTable.name });

// Exports
export const apiArn = restApi.arn;
export const apiUrl = deployment.invokeUrl;
export const lambdaArn = newsLambda.arn;
export const newsTableArn = newsTable.arn;
export const newsSourcesTableArn = newsSourcesTable.arn;
