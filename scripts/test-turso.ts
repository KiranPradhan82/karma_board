import { createClient } from '@libsql/client';

async function main() {
  const url = 'libsql://karmaboarddb-kiran2057.aws-eu-west-1.turso.io';
  const token = process.env.TURSO_AUTH_TOKEN;
  console.log('Token prefix:', token?.substring(0, 30) + '...');
  const client = createClient({ url, authToken: token });
  try {
    const r = await client.execute({ sql: 'SELECT 1 as test', args: [] });
    console.log('SUCCESS:', r.rows);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    console.log('Tables:', tables.rows.map(t => t.name));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('FAILED:', msg);
  }
}

main();
