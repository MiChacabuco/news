import { interpolate, Output, Input } from '@pulumi/pulumi';
import { apigateway, iam } from '@pulumi/aws';

import { buildAssumeRolePolicy, buildAllowedPolicy } from '../utils';
import environment from '../../environment';

const { projectName, region } = environment;

const createResource = (
  name: string,
  restApi: apigateway.RestApi,
  pathPart: string
): apigateway.Resource => {
  return new apigateway.Resource(name, {
    restApi,
    parentId: restApi.rootResourceId,
    pathPart,
  });
};

const createApiMethod = (
  baseName: string,
  restApi: apigateway.RestApi,
  resource: apigateway.Resource,
  requestValidator: apigateway.RequestValidator,
  role: iam.Role,
  action: string,
  requestTemplates: { [key: string]: Input<string> },
  requestParameters?: { [key: string]: boolean }
) => {
  const commonParams = {
    restApi,
    resourceId: resource.id,
    httpMethod: 'GET',
  };

  // Method
  const method = new apigateway.Method(`${baseName}-method`, {
    ...commonParams,
    authorization: 'NONE',
    requestParameters,
    requestValidatorId: requestValidator.id,
  });
  const methodResponse = new apigateway.MethodResponse(
    `${baseName}-method-response`,
    {
      ...commonParams,
      statusCode: '200',
    },
    { dependsOn: [method] }
  );

  // Integration
  const integration = new apigateway.Integration(
    `${baseName}-integration`,
    {
      ...commonParams,
      type: 'AWS',
      integrationHttpMethod: 'POST',
      uri: `arn:aws:apigateway:${region}:dynamodb:action/${action}`,
      credentials: role.arn,
      requestTemplates,
    },
    { dependsOn: [method] }
  );
  const integrationResponse = new apigateway.IntegrationResponse(
    `${baseName}-integration-response`,
    {
      ...commonParams,
      statusCode: '200',
    },
    { dependsOn: [integration] }
  );

  return { method, methodResponse, integration, integrationResponse };
};

export const createNewsApi = (
  newsTableName: Output<string>,
  sourcesTableName: Output<string>
): { restApi: apigateway.RestApi; deployment: apigateway.Deployment } => {
  // Create API Gateway role
  const role = new iam.Role(`${projectName}-apigateway-role`, {
    assumeRolePolicy: buildAssumeRolePolicy(['apigateway']),
  });

  // Create API Gateway policy
  const policy = buildAllowedPolicy(`${projectName}-apigateway-policy`, [
    'dynamodb:Query',
    'dynamodb:Scan',
  ]);

  // Attach policy to role
  new iam.RolePolicyAttachment(
    `${projectName}-apigateway-role-policy-attachment`,
    {
      role,
      policyArn: policy.arn,
    }
  );

  // API
  const restApiName = `${projectName}-api`;
  const restApi = new apigateway.RestApi(restApiName, {
    endpointConfiguration: {
      types: 'REGIONAL',
    },
  });
  const requestValidator = new apigateway.RequestValidator(
    `${restApiName}-validator`,
    {
      restApi,
      validateRequestParameters: true,
    }
  );

  // News endpoints
  const newsResourceName = `${restApiName}-news`;
  const newsResource = createResource(newsResourceName, restApi, 'news');
  const newsMethodOutput = createApiMethod(
    newsResourceName,
    restApi,
    newsResource,
    requestValidator,
    role,
    'Query',
    {
      'application/json': interpolate`
        #set($exclusiveStartKey = $input.params('exclusiveStartKey'))
        {
          "TableName": "${newsTableName}",
          "KeyConditionExpression": "#Source = :source",
          "ExpressionAttributeNames": {"#Source": "Source"},
          "ExpressionAttributeValues": {":source": {"S": "$input.params('source')"}},
          "Limit": 5,
          #if($exclusiveStartKey.length() > 0)
          "ExclusiveStartKey": $util.base64Decode($exclusiveStartKey),
          #end
          "ScanIndexForward": false
        }
      `,
    },
    {
      'method.request.querystring.source': true,
      'method.request.querystring.exclusiveStartKey': false,
    }
  );

  // Sources endpoints
  const sourcesResourceName = `${restApiName}-sources`;
  const sourcesResource = createResource(
    sourcesResourceName,
    restApi,
    'sources'
  );
  const sourcesMethodOutput = createApiMethod(
    sourcesResourceName,
    restApi,
    sourcesResource,
    requestValidator,
    role,
    'Scan',
    {
      'application/json': interpolate`
        {
          "TableName": "${sourcesTableName}"
        }
      `,
    }
  );

  // Deployment
  const stageName = 'v1';
  const deployment = new apigateway.Deployment(
    `${restApiName}-stage-${stageName}`,
    {
      restApi,
      stageName,
    },
    {
      dependsOn: [
        newsMethodOutput.integrationResponse,
        sourcesMethodOutput.integration,
      ],
    }
  );
  return { restApi, deployment };
};
