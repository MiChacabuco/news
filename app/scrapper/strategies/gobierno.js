const AWS = require("aws-sdk");
const stream = require("stream");
const axios = require("axios");

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const dateToTimestamp = (date) => new Date(date).getTime();

const getLatestSourceDate = async () => {
  const { WP_NEWS_URL } = process.env;
  const params = {
    _fields: "date_gmt",
    per_page: 1,
  };
  const response = await axios.get(WP_NEWS_URL, { params });
  const latestNews = response.data[0];
  return dateToTimestamp(latestNews.date_gmt);
};

const getLatestSavedDate = async () => {
  const { TABLE_NAME } = process.env;
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "#Source = :source",
    ExpressionAttributeNames: { "#Source": "Source" },
    ExpressionAttributeValues: { ":source": "gobierno" },
    ProjectionExpression: "CreatedAt",
    ScanIndexForward: false,
    Limit: 1,
  };
  const { Items } = await dynamodb.query(params).promise();
  if (!Items.length) {
    return null;
  }
  return Items[0].CreatedAt;
};

const getImageInfo = async (href) => {
  const fields = ["guid.rendered", "mime_type"];
  const params = {
    _fields: fields.join(","),
  };
  let response;
  try {
    response = await axios.get(href, { params });
  } catch (error) {
    console.warn(`Failed to get image info (${href}): ${error}`);
    return;
  }
  const { guid, mime_type } = response.data;
  // Convert mime type to extension
  const mimeTypeRegex = new RegExp("(?:.*)/(.*)");
  const extension = mimeTypeRegex.exec(mime_type)[1];
  return { url: guid.rendered, extension };
};

const downloadImage = async (url) => {
  console.log(`Downloading image (${url}) ...`);
  let response;
  try {
    response = await axios.get(encodeURI(url), { responseType: "stream" });
  } catch (error) {
    console.warn(`Failed to download image (${url}): ${error}`);
    return;
  }
  console.log(`Image (${url}) downloaded.`);
  return response;
};

const uploadImage = async (imageResponse, fileName) => {
  console.log(`Uploading image (${fileName}) to S3 ...`);
  const passthrough = new stream.PassThrough();
  const { BUCKET_NAME, MEDIA_PATH } = process.env;
  const Key = `${MEDIA_PATH}/${fileName}`;
  const params = {
    Bucket: BUCKET_NAME,
    Key,
    Body: passthrough,
    ContentType: imageResponse.headers["content-type"],
    ContentLength: imageResponse.headers["content-length"],
    ACL: "public-read",
  };
  imageResponse.data.pipe(passthrough);
  try {
    await s3.upload(params).promise();
  } catch (error) {
    console.warn(`Failed to upload image (${fileName}) to S3: ${error}`);
    return null;
  }
  console.log(`Image (${fileName}) successfully uploaded to S3.`);
  return Key;
};

const processItem = async (item) => {
  const result = {
    Id: item.id,
    Title: item.title.rendered.replace("&#8211;", "–"),
    Summary: item.content.rendered.replace(/<[^>]*>/g, ""),
    Link: item.link,
    Source: "gobierno",
    CreatedAt: dateToTimestamp(item.date_gmt),
  };
  const media = item._links["wp:featuredmedia"];
  if (media.length) {
    // Download news image
    const imageInfo = await getImageInfo(media[0].href);
    if (imageInfo) {
      const { url, extension } = imageInfo;
      // Upload image to S3
      const imageResponse = await downloadImage(url);
      const fileName = `${item.id}.${extension}`;
      const imagePath = await uploadImage(imageResponse, fileName);
      if (imagePath) {
        result.Image = imagePath;
      }
    }
  }
  return result;
};

const fetchNews = async (minDate) => {
  const { WP_NEWS_URL } = process.env;
  const fields = [
    "id",
    "link",
    "title.rendered",
    "content.rendered",
    "date_gmt",
    "_links.wp:featuredmedia.0.href",
  ];
  const params = {
    _fields: fields.join(","),
  };
  console.log("Fetching news ...");
  const response = await axios.get(WP_NEWS_URL, { params });
  const newsPromises = [];
  response.data.forEach((item) => {
    // Skip already saved news
    if (dateToTimestamp(item.date_gmt) > minDate) {
      newsPromises.push(processItem(item));
    }
  });
  console.log(`${newsPromises.length} news to process.`);
  return Promise.all(newsPromises);
};

const saveNews = async (news) => {
  console.log(`Saving ${news.length} news into DynamoDB ...`);
  const { TABLE_NAME } = process.env;
  const putPromises = news.map((Item) => {
    const params = {
      TableName: TABLE_NAME,
      Item,
    };
    return dynamodb
      .put(params)
      .promise()
      .catch((error) => {
        console.warn(
          `Error while trying to save news ${Item.Id} into DynamoDB: ${error}`
        );
      });
  });
  return Promise.all(putPromises).then(() => {
    console.log("News saved into DynamoDB.");
  });
};

exports.start = async () => {
  console.log("Getting news ...");
  const latestSavedDate = await getLatestSavedDate();
  if (latestSavedDate) {
    const latestSourceDate = await getLatestSourceDate();
    if (latestSourceDate <= latestSavedDate) {
      console.log("No news to save.");
      return;
    }
  }
  const news = await fetchNews(latestSavedDate);
  await saveNews(news);

  return {
    statusCode: 200,
    body: JSON.stringify(news),
  };
};
