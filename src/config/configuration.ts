export default () => {
  const isTest = process.env.NODE_ENV === 'test';
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    swaggerPath: process.env.SWAGGER_PATH || 'api/docs',
    appName: process.env.APP_NAME || 'Sun* Conduit API',
    fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    database: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      name: isTest
        ? process.env.DB_TEST_NAME || `${process.env.DB_NAME}_test`
        : process.env.DB_NAME,
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  };
};
