import logging
import boto3

from .strategies import GobiernoStrategy
from .settings import LOG_LEVEL

# Set logger's levels
for logger_name in ["boto3", "botocore", "urllib3", "s3transfer", "scrapy"]:
    logger = logging.getLogger(logger_name)
    logger.setLevel(LOG_LEVEL)


def run(event, context):
    strategies = [GobiernoStrategy]
    for strategy in strategies:
        strategy()
