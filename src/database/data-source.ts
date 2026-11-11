import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { fileURLToPath } from 'url';
import { UserEntity } from '../modules/users/entities/user.entity.js';
import { validateEnv } from '../config/env.validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const env = validateEnv(process.env);

const isTest = env.NODE_ENV === 'test';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: isTest ? env.DB_TEST_NAME || `${env.DB_NAME}_test` : env.DB_NAME,
  entities: [UserEntity],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
  logging: env.NODE_ENV === 'development',
};

const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
