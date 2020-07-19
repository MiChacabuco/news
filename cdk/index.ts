#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";

import { NewsStack } from "./stacks/news-stack";

const app = new cdk.App();
new NewsStack(app, "NewsStack");
