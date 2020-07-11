exports.handler = async () => {
  const AWS = require("aws-sdk");
  const { REGION, TABLE_NAME, MEDIA_URL } = process.env;

  const dynamoDbService = new AWS.DynamoDB({ region: REGION });
  const docClient = new AWS.DynamoDB.DocumentClient({
    service: dynamoDbService,
  });

  let result;
  try {
    result = await docClient.scan({ TableName: TABLE_NAME }).promise();
  } catch (e) {
    return {
      statusCode: 500,
      body: e,
    };
  }

  // Add base url to avatars
  result.Items = result.Items.map((item) => ({
    ...item,
    Avatar: `${MEDIA_URL}${item.Avatar}`,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
