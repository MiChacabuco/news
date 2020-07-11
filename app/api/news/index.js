const atob = (from) => Buffer.from(from, "base64").toString("binary");

exports.handler = async (event) => {
  const AWS = require("aws-sdk");
  const { REGION, TABLE_NAME, MEDIA_URL } = process.env;

  const {
    Source,
    CreatedAt,
    ProjectionExpression,
    Limit = "5",
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
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression,
    ExpressionAttributeNames: { "#Source": "Source" },
    ExpressionAttributeValues,
    ProjectionExpression,
    Limit: Number(Limit),
    ScanIndexForward: false,
  };

  if (ExclusiveStartKey) {
    params.ExclusiveStartKey = JSON.parse(atob(ExclusiveStartKey));
  }

  let result;
  try {
    result = await docClient.query(params).promise();
  } catch (e) {
    return {
      statusCode: 500,
      body: e,
    };
  }

  // Add base url to images
  result.Items = result.Items.map((item) => {
    if (!item.Image) {
      // No image, continue.
      return item;
    }

    return {
      ...item,
      Image: `${MEDIA_URL}${item.Image}`,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
