import * as path from "path";
import {
  Construct,
  Duration,
  Stack,
  StackProps,
  CfnParameter,
} from "@aws-cdk/core";
import {
  RestApi,
  LambdaIntegration,
  EndpointType,
} from "@aws-cdk/aws-apigateway";
import { Function, Runtime, Code } from "@aws-cdk/aws-lambda";
import { Table, AttributeType } from "@aws-cdk/aws-dynamodb";
import { Bucket, IBucket } from "@aws-cdk/aws-s3";
import { Rule, RuleTargetInput, Schedule } from "@aws-cdk/aws-events";
import { LambdaFunction } from "@aws-cdk/aws-events-targets";

const { PWD = "" } = process.env;

export class NewsStack extends Stack {
  private _newsTable: Table;
  private _sourcesTable: Table;
  private _mediaUrl: CfnParameter;
  private _bucketName: CfnParameter;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.createNewsScrapper();
    this.createNewsApi();
  }

  get newsTable(): Table {
    if (!this._newsTable) {
      this._newsTable = new Table(this, "news-table", {
        partitionKey: {
          name: "Source",
          type: AttributeType.STRING,
        },
        sortKey: {
          name: "CreatedAt",
          type: AttributeType.NUMBER,
        },
      });
    }
    return this._newsTable;
  }

  get sourcesTable(): Table {
    if (!this._sourcesTable) {
      this._sourcesTable = new Table(this, "sources-table", {
        partitionKey: {
          name: "Id",
          type: AttributeType.STRING,
        },
        writeCapacity: 1,
      });
    }
    return this._sourcesTable;
  }

  get mediaUrl(): string {
    if (!this._mediaUrl) {
      this._mediaUrl = new CfnParameter(this, "mediaUrl", {
        description: "The base URL (protocol + domain) for media files.",
      });
    }
    return this._mediaUrl.valueAsString;
  }

  get bucketName(): string {
    if (!this._bucketName) {
      this._bucketName = new CfnParameter(this, "bucketName", {
        description: "The name of the bucket that will store the media files.",
      });
    }
    return this._bucketName.valueAsString;
  }

  get mediaBucket(): IBucket {
    return Bucket.fromBucketName(this, "media-bucket", this.bucketName);
  }

  createNewsScrapper(): Function {
    const codePath = path.join(PWD, "src", "scrapper", "build");
    const scrapper = new Function(this, "news-scrapper", {
      code: Code.fromAsset(codePath),
      handler: "scrapper/src/index.handler",
      runtime: Runtime.NODEJS_12_X,
      timeout: Duration.seconds(30),
      environment: {
        BUCKET_NAME: this.bucketName,
        TABLE_NAME: this.newsTable.tableName,
        MEDIA_PATH: "media/news",
        GOBIERNO_API_URL: "https://chacabuco.gob.ar/wp-json/wp/v2/posts",
      },
    });

    // Allow scrapper to access the news table
    this.newsTable.grant(scrapper, "dynamodb:Query", "dynamodb:PutItem");

    // Allow scrapper to put objects in S3
    this.mediaBucket.grantPut(scrapper);

    // Trigger the scrapper every 5 minutes
    new Rule(this, "scrapper-schedule", {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(scrapper)],
    });

    return scrapper;
  }

  createNewsApi(): RestApi {
    const api = new RestApi(this, "news-api", {
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
      deployOptions: {
        stageName: "v1",
      },
    });
    this.addNewsEndpoint(api);
    return api;
  }

  addNewsEndpoint(api: RestApi) {
    const newsResource = api.root.addResource("news");
    const newsLambda = this.createNewsLambda();
    newsResource.addMethod("GET", new LambdaIntegration(newsLambda), {
      requestParameters: {
        "method.request.querystring.Source": true,
      },
      requestValidatorOptions: {
        validateRequestParameters: true,
      },
    });
  }

  createNewsLambda(): Function {
    const id = "news-lambda";
    const codePath = path.join(PWD, "src", "api", "build");
    const lambda = new Function(this, id, {
      code: Code.fromAsset(codePath),
      handler: "api/src/index.handler",
      timeout: Duration.seconds(10),
      runtime: Runtime.NODEJS_12_X,
      environment: {
        REGION: this.region,
        NEWS_TABLE_NAME: this.newsTable.tableName,
        SOURCES_TABLE_NAME: this.sourcesTable.tableName,
        DEFAULT_LIMIT: "10",
        MAX_LIMIT: "25",
        SUMMARY_LENGTH: "280",
        MEDIA_URL: this.mediaUrl,
      },
    });

    // Grant access to the news and sources tables
    this.newsTable.grant(lambda, "dynamodb:Query");
    this.sourcesTable.grant(lambda, "dynamodb:Scan");

    // Keep the Lambda warm
    this.warmLambda(lambda, id);

    return lambda;
  }

  warmLambda(lambda: Function, lambdaId: string): Rule {
    /* Rule to keep warm a given Lambda */
    const lambdaTarget = new LambdaFunction(lambda, {
      event: RuleTargetInput.fromObject({ warm: true }),
    });
    const rule = new Rule(this, `${lambdaId}-warmer`, {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [lambdaTarget],
    });

    return rule;
  }
}
