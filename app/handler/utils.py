import logging
from datetime import datetime
from os import environ

from .settings import LOG_LEVEL


def get_logger() -> logging.Logger:
    logger = logging.getLogger()
    logger.setLevel(LOG_LEVEL)
    return logger


def struct_to_timestamp(struct_time) -> int:
    timestamp = datetime(*struct_time[:6]).timestamp()
    return round(timestamp)
