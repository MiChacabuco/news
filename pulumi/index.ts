import { createNewsApi } from './resources/apigateway';
import { createNewsTable, createNewsSourcesTable } from './resources/dynamodb';
import { createNewsScrapperLambda } from './resources/lambda';
import environment from './environment';

const run = async () => {
  // Create the news tables
  const newsTable = createNewsTable();
  const newsSourcesTable = createNewsSourcesTable();
  // Create the news API Gateway
  const { restAPI, deployment } = createNewsApi(newsTable, newsSourcesTable);
  // Create the news Lambda
  const newsLambda = createNewsScrapperLambda(
    environment.bucketName,
    newsTable
  );

  // Exports
  return {
    apiArn: restAPI.arn,
    apiUrl: deployment.invokeUrl,
    lambdaArn: newsLambda.arn,
    newsTableArn: newsTable.arn,
    newsSourcesTableArn: newsSourcesTable.arn,
  };
};

run();
