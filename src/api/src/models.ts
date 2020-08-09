export interface Event {
  warm?: boolean;
  queryStringParameters: {
    [key: string]: string;
  };
}
