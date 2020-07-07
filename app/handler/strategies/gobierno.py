import io
import os
import re
from typing import Union
from urllib.parse import urlparse, parse_qs

import boto3
import feedparser
import requests
import scrapy
from requests.adapters import HTTPAdapter
from scrapy.crawler import CrawlerProcess
from urllib3 import Retry

from ..utils import struct_to_timestamp, get_logger
from ..settings import BUCKET_NAME, FEED_URL, MEDIA_PATH, TABLE_NAME

images = {}
logger = get_logger()
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def get_entry_guid(url) -> str:
    parsed_url = urlparse(url)
    parsed_qs = parse_qs(parsed_url.query)
    return parsed_qs["p"][0]


class GetImagesSpider(scrapy.Spider):
    short_urls = {}
    name = "get_image"

    def __init__(self, entries):
        long_urls = []
        for entry in entries:
            self.short_urls[entry.link] = entry.id
            long_urls.append(entry.link)
        self.start_urls = long_urls
        super().__init__()

    def parse(self, response):
        image_src = response.css("article > div > img::attr(src)").get()
        short_url = self.short_urls[response.url]
        guid = get_entry_guid(short_url)
        images[guid] = image_src


class GobiernoStrategy:
    http = None

    def __init__(self):
        self.init_http_client()
        self.check_news()

    @property
    def last_update(self) -> int:
        query_kwargs = {
            "KeyConditionExpression": "#Source = :source",
            "ExpressionAttributeNames": {"#Source": "Source"},
            "ExpressionAttributeValues": {":source": "gobierno"},
            "ProjectionExpression": "CreatedAt",
            "ScanIndexForward": False,
            "Limit": 1,
        }
        result = table.query(**query_kwargs)
        try:
            last_item = result["Items"][0]
        except IndexError:
            return None
        return last_item["CreatedAt"]

    def init_http_client(self):
        self.http = requests.Session()
        retries = Retry(
            total=3, backoff_factor=0.5, status_forcelist=(500, 502, 503, 504)
        )
        self.http.mount("http://", HTTPAdapter(max_retries=retries))
        self.http.mount("https://", HTTPAdapter(max_retries=retries))

    def check_news(self):
        logger.info("Getting news ...")
        global images
        images = {}
        feed = feedparser.parse(FEED_URL)
        feed_updated = struct_to_timestamp(feed.feed.updated_parsed)
        last_update = self.last_update
        if last_update is not None and last_update == feed_updated:
            logger.info("No news to save.")
            return
        entries = feed.entries
        if last_update is not None:
            # Remove already processed news
            entries = [
                entry
                for entry in entries
                if struct_to_timestamp(entry.published_parsed) > last_update
            ]
        logger.info(f"{len(entries)} news to save.")
        # Get images and save
        self.fetch_images(entries)
        self.put_news(entries)

    def format_entry(self, entry):
        guid = get_entry_guid(entry.id)

        entry = {
            "Id": guid,
            "Title": entry.title,
            "Summary": self.clean_summary(entry.summary),
            "Link": entry.link,
            "Source": "gobierno",
            "CreatedAt": struct_to_timestamp(entry.published_parsed),
        }
        url = images.get(guid)
        if url:
            extension = re.search("\.(jpe?g|png)", url)[1]
            file_name = f"{guid}.{extension}"
            image_path = self.upload_image(url, file_name)
            if image_path:
                entry["Image"] = image_path
        return entry

    def upload_image(self, url: str, file_name: str) -> Union[str, None]:
        if not url:
            return None
        logger.info("Downloading image ...")
        try:
            response = self.http.get(url)
            response.raise_for_status()
        except requests.exceptions.RequestException:
            logger.error("Error while trying to download image.")
            return None
        logger.info("Image downloaded. Saving it into S3 ...")
        s3 = boto3.resource("s3")
        bucket = s3.Bucket(BUCKET_NAME)
        image = io.BytesIO(response.content)
        key = f"/{MEDIA_PATH}/{file_name}"
        bucket.upload_fileobj(image, key, ExtraArgs={"ACL": "public-read",})
        logger.info("Image successfully uploaded to S3.")
        return key

    def put_news(self, news):
        logger.info("Saving news into DynamoDb ...")
        for n in news:
            item = self.format_entry(n)
            table.put_item(Item=item)

    @staticmethod
    def clean_summary(summary: str) -> str:
        return (
            summary.replace("\xa0", " ")
            .replace("[&#8230;]", "...")
            .replace("&#8211;", "-")
            .replace("&#8220;", '"')
            .replace("&#8221;", '"')
        )

    @staticmethod
    def fetch_images(entries):
        logger.info("Getting news images ...")
        process = CrawlerProcess()
        process.crawl(GetImagesSpider, entries)
        process.start()
