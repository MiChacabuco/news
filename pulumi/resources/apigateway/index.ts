import { interpolate, Output, CustomResourceOptions } from '@pulumi/pulumi';
import { apigateway, iam } from '@pulumi/aws';

import { buildAssumeRolePolicy, buildAllowedPolicy } from '../utils';
import environment from '../../environment';

const { projectName, region } = environment;

export const createNewsApi = (
  tableName: Output<string>
): { restApi: apigateway.RestApi; deployment: apigateway.Deployment } => {
  // Create API Gateway role
  const role = new iam.Role(`${projectName}-apigateway-role`, {
    assumeRolePolicy: buildAssumeRolePolicy(['apigateway']),
  });

  // Create API Gateway policy
  const policy = buildAllowedPolicy(`${projectName}-apigateway-policy`, [
    'dynamodb:Query',
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

  // Resources
  const newsResourceName = `${restApiName}-news`;
  const newsResource = new apigateway.Resource(newsResourceName, {
    restApi,
    parentId: restApi.rootResourceId,
    pathPart: 'news',
  });

  // Methods
  const newsGetName = `${newsResourceName}-get`;
  const requestValidator = new apigateway.RequestValidator(
    `${newsGetName}-validator`,
    {
      restApi,
      validateRequestParameters: true,
    }
  );
  const commonParams = {
    restApi,
    resourceId: newsResource.id,
    httpMethod: 'GET',
  };
  const getMethod = new apigateway.Method(`${newsGetName}-method`, {
    ...commonParams,
    authorization: 'NONE',
    requestParameters: {
      'method.request.querystring.source': true,
      'method.request.querystring.exclusiveStartKey': false,
    },
    requestValidatorId: requestValidator.id,
  });
  const getMethodResponse = new apigateway.MethodResponse(
    `${newsGetName}-method-response`,
    {
      ...commonParams,
      statusCode: '200',
    },
    { dependsOn: [getMethod] }
  );

  // Integrations
  const pageLimit = 5;
  const getIntegration = new apigateway.Integration(
    `${newsGetName}-integration`,
    {
      ...commonParams,
      type: 'AWS',
      integrationHttpMethod: 'POST',
      uri: `arn:aws:apigateway:${region}:dynamodb:action/Query`,
      credentials: role.arn,
      requestTemplates: {
        'application/json': interpolate`
        #set($exclusiveStartKey = $input.params('exclusiveStartKey'))
        {
            "TableName": "${tableName}",
            "KeyConditionExpression": "#Source = :source",
            "ExpressionAttributeNames": {"#Source": "Source"},
            "ExpressionAttributeValues": {":source": {"S": "$input.params('source')"}},
            "Limit": ${pageLimit},
            #if($exclusiveStartKey.length() > 0)
            "ExclusiveStartKey": $util.base64Decode($exclusiveStartKey),
            #end
            "ScanIndexForward": false
        }
      `,
      },
    },
    { dependsOn: [getMethod] }
  );
  const getIntegrationResponse = new apigateway.IntegrationResponse(
    `${newsGetName}-integration-response`,
    {
      ...commonParams,
      statusCode: '200',
    },
    { dependsOn: [getIntegration] }
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
      dependsOn: [getMethodResponse, getIntegration, getIntegrationResponse],
    }
  );
  return { restApi, deployment };
};
