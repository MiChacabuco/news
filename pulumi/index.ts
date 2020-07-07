import { createNewsApi } from './resources/apigateway';
import { createNewsTable } from './resources/dynamodb';
import { createNewsLambda } from './resources/lambda';

// Create the news table
const newsTable = createNewsTable();
// Create the news API Gateway
const { restApi, deployment } = createNewsApi(newsTable.name);
// Create the news Lambda
const newsLambda = createNewsLambda({ TABLE_NAME: newsTable.name });

// Exports
export const apiArn = restApi.arn;
export const apiUrl = deployment.invokeUrl;
export const lambdaArn = newsLambda.arn;
export const tableArn = newsTable.arn;
