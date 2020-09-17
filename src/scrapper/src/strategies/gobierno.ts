import { S3, DynamoDB } from "aws-sdk";
import axios, { AxiosResponse } from "axios";
import { Stream, PassThrough } from "stream";

import { News } from "../../../common/models";
import { dateToTimestamp, asciiToChar } from "../utils";
import { NewsWP } from "../../../common/models/news";

const s3 = new S3();
const dynamodb = new DynamoDB.DocumentClient();

export default class Gobierno {
  async start() {
    console.log("Getting news ...");

    const latestSavedDate = await this.getLatestSavedDate();
    if (latestSavedDate) {
      const latestSourceDate = await this.getLatestSourceDate();
      if (latestSourceDate <= latestSavedDate) {
        console.log("No news to save.");
        return;
      }
    }
    const news = await this.fetchNews(latestSavedDate);
    await this.saveNews(news);

    return {
      statusCode: 200,
      body: JSON.stringify(news),
    };
  }

  async saveNews(news: News[]): Promise<void> {
    console.log(`Saving ${news.length} news into DynamoDB ...`);

    const { TABLE_NAME = "" } = process.env;
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
  }

  async getLatestSourceDate(): Promise<number> {
    const { GOBIERNO_API_URL = "" } = process.env;
    const params = {
      fields: "date_gmt",
      per_page: 1,
    };
    const response = await axios.get<{ date_gmt: string }[]>(GOBIERNO_API_URL, {
      params,
    });
    const latestNews = response.data[0];

    return dateToTimestamp(latestNews.date_gmt);
  }

  async getLatestSavedDate(): Promise<number> {
    const { TABLE_NAME = "" } = process.env;
    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "#Source = :source",
      ExpressionAttributeNames: { "#Source": "Source" },
      ExpressionAttributeValues: { ":source": "gobierno" },
      ProjectionExpression: "CreatedAt",
      ScanIndexForward: false,
      Limit: 1,
    };

    const { Items } = await dynamodb.query(params).promise();
    const news = Items as News[];
    return news.length ? news[0].CreatedAt : 0;
  }

  async getImageInfo(
    href: string
  ): Promise<{ url: string; extension: string } | void> {
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

    // Convert mime type to extension
    const { guid, mime_type } = response.data;
    const mimeTypeRegex = new RegExp("(?:.*)/(.*)");
    const regexResult = mimeTypeRegex.exec(mime_type);
    const extension = regexResult?.length ? regexResult[1] : "";

    return { url: guid.rendered, extension };
  }

  async downloadImage(url: string): Promise<AxiosResponse<Stream> | void> {
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
  }

  async uploadImage(
    imageResponse: AxiosResponse<Stream>,
    fileName: string
  ): Promise<string | null> {
    console.log(`Uploading image (${fileName}) to S3 ...`);

    const passthrough = new PassThrough();
    const { BUCKET_NAME = "", MEDIA_PATH } = process.env;
    const Key = `${MEDIA_PATH}/${fileName}`;
    const params: S3.Types.PutObjectRequest = {
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
  }

  async processItem(item: NewsWP): Promise<News> {
    const result: News = {
      Id: item.id,
      Title: asciiToChar(item.title.rendered),
      Summary: asciiToChar(item.content.rendered.replace(/<[^>]*>/g, "")),
      Link: item.link,
      Source: "gobierno",
      CreatedAt: dateToTimestamp(item.date_gmt),
    };

    const media = item._links["wp:featuredmedia"];
    if (media?.length) {
      // Download news image
      const imageInfo = await this.getImageInfo(media[0].href);
      if (imageInfo) {
        const { url, extension } = imageInfo;
        // Upload image to S3
        const imageResponse = await this.downloadImage(url);
        if (imageResponse) {
          const fileName = `${item.id}.${extension}`;
          const imagePath = await this.uploadImage(imageResponse, fileName);
          if (imagePath) {
            result.Image = imagePath;
          }
        }
      }
    }

    return result;
  }

  async fetchNews(minDate: number): Promise<News[]> {
    console.log("Fetching news ...");

    const { GOBIERNO_API_URL = "" } = process.env;
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
    const response = await axios.get<NewsWP[]>(GOBIERNO_API_URL, { params });
    const newsPromises: Promise<News>[] = [];
    response.data.forEach((item) => {
      // Skip already saved news
      if (dateToTimestamp(item.date_gmt) > minDate) {
        newsPromises.push(this.processItem(item));
      }
    });

    console.log(`${newsPromises.length} news to process.`);
    return Promise.all(newsPromises);
  }
}
