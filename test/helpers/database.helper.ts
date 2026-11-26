import { DataSource } from 'typeorm';

export async function truncateDatabase(dataSource: DataSource): Promise<void> {
  if (!dataSource || !dataSource.isInitialized) {
    return;
  }

  const dbName = String(dataSource.options.database ?? '');
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to truncate non-test database "${dbName}". Ensure NODE_ENV=test.`,
    );
  }

  const tableNames = dataSource.entityMetadatas.map(
    (metadata) => `"${metadata.tableName}"`,
  );

  if (tableNames.length === 0) {
    return;
  }

  await dataSource.query(
    `TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`,
  );
}
