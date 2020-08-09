import { DynamoDB } from "aws-sdk";

import { News, NewsSource } from "../../common/models";
import { Event } from "./models";
import { atob, logWarmState } from "./utils";

// Environment variables
const {
  REGION,
  NEWS_TABLE_NAME = "",
  SOURCES_TABLE_NAME = "",
  MEDIA_URL,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SUMMARY_LENGTH,
} = process.env;

// Init DynamoDB document client
const docClient = new DynamoDB.DocumentClient({
  service: new DynamoDB({ region: REGION }),
});

// Initial warm state
let warm = false;

export const handler = async (event: Event) => {
  if (event.warm) {
    // Lambda warmed, return ASAP.
    logWarmState("warmer", warm);
    warm = true;
    return;
  }

  logWarmState("user", warm);
  warm = true;

  // Request parameters
  const {
    Source,
    CreatedAt,
    ProjectionExpression,
    Limit = DEFAULT_LIMIT,
    ExclusiveStartKey,
  } = event.queryStringParameters;

  // Fetch news and sources
  let KeyConditionExpression = "#Source = :source";
  let ExpressionAttributeValues: DynamoDB.DocumentClient.ExpressionAttributeValueMap = {
    ":source": Source,
  };

  if (CreatedAt) {
    KeyConditionExpression += " AND CreatedAt = :createdAt";
    ExpressionAttributeValues = {
      ...ExpressionAttributeValues,
      ":createdAt": CreatedAt,
    };
  }

  const newsParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: NEWS_TABLE_NAME,
    KeyConditionExpression,
    ExpressionAttributeNames: { "#Source": "Source" },
    ExpressionAttributeValues,
    ProjectionExpression,
    Limit: Math.min(Number(Limit), Number(MAX_LIMIT)),
    ScanIndexForward: false,
  };

  if (ExclusiveStartKey) {
    newsParams.ExclusiveStartKey = JSON.parse(atob(ExclusiveStartKey));
  }

  let newsResult: DynamoDB.DocumentClient.QueryOutput;
  let sourcesResult: DynamoDB.DocumentClient.QueryOutput;

  try {
    newsResult = await docClient.query(newsParams).promise();
    sourcesResult = await docClient
      .scan({ TableName: SOURCES_TABLE_NAME })
      .promise();
  } catch (e) {
    return {
      statusCode: 500,
      body: e,
    };
  }

  // Hash the sources for embedding
  const sources: { [id: string]: Partial<NewsSource> } = {};
  const sourceItems = sourcesResult.Items ?? [];

  sourceItems.forEach((item) => {
    const source: NewsSource = item as NewsSource;
    const { Id, Name, Avatar } = source;
    sources[Id] = {
      Name,
      // Add base url to avatar
      Avatar: `${MEDIA_URL}/${Avatar}`,
    };
  });

  // Map the output
  const newsItems = newsResult.Items ?? [];

  newsResult.Items = newsItems.map((item) => {
    const news = item as News;
    // Embed the source
    if (news.Source) {
      news.Source = sources[Source];
    }

    // Truncate the summary
    if (news.Summary) {
      news.Summary = `${news.Summary.slice(0, Number(SUMMARY_LENGTH))} ...`;
    }

    // Add base url to image
    if (news.Image) {
      news.Image = `${MEDIA_URL}/${news.Image}`;
    }

    return news;
  });

  return {
    statusCode: 200,
    body: JSON.stringify(newsResult),
  };
};
