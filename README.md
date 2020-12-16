# Chacabuco news scrapper

> Serverless news scrapper for the city of Chacabuco (Buenos Aires), running in [AWS](https://aws.amazon.com).

## Services

- **api:** REST API
- **scrapper:** Scrapper service

## Build

```bash
# cd into service
cd src/<service>

# install dependencies
yarn install

# build for production
yarn run build
```

## Deployment

```bash
yarn cdk deploy --parameters mediaUrl=<url> --parameters bucketName=<name>
```
