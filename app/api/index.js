const warmer = require("lambda-warmer");

const atob = (from) => Buffer.from(from, "base64").toString("binary");

exports.handler = async (event) => {
  if (await warmer(event)) {
    return "warmed";
  }
  const AWS = require("aws-sdk");
  const {
    REGION,
    SOURCES_TABLE_NAME,
    NEWS_TABLE_NAME,
    MEDIA_URL,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    SUMMARY_LENGTH,
  } = process.env;

  const {
    Source,
    CreatedAt,
    ProjectionExpression,
    Limit = DEFAULT_LIMIT,
    ExclusiveStartKey,
  } = event.queryStringParameters;

  const dynamoDbService = new AWS.DynamoDB({ region: REGION });
  const docClient = new AWS.DynamoDB.DocumentClient({
    service: dynamoDbService,
  });
  let KeyConditionExpression = "#Source = :source";
  let ExpressionAttributeValues = {
    ":source": Source,
  };
  if (CreatedAt) {
    KeyConditionExpression += " AND CreatedAt = :createdAt";
    ExpressionAttributeValues = {
      ...ExpressionAttributeValues,
      ":createdAt": CreatedAt,
    };
  }
  const newsParams = {
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

  let newsResult;
  let sourcesResult;
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

  // Hash the sources for Embedding
  const sources = {};
  sourcesResult.Items.forEach((source) => {
    const { Id, Name, Avatar } = source;
    sources[Id] = {
      Name,
      // Add base url to avatar
      Avatar: `${MEDIA_URL}${Avatar}`,
    };
  });

  newsResult.Items = newsResult.Items.map((item) => {
    // Embed the source
    if (item.Source) {
      item.Source = sources[Source];
    }

    // Truncate the summary
    if (item.Summary) {
      item.Summary = `${item.Summary.slice(0, Number(SUMMARY_LENGTH))} ...`;
    }

    // Add base url to image
    if (item.Image) {
      item.Image = `${MEDIA_URL}${item.Image}`;
    }

    return item;
  });

  return {
    statusCode: 200,
    body: JSON.stringify(newsResult),
  };
};
