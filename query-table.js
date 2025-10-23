// Load environment variables from .env file
require('dotenv').config();

const { BigQuery } = require('@google-cloud/bigquery');

const credentials = JSON.parse(process.env.BQTAP_GOOGLE_API_CREDENTIALS);

const bigquery = new BigQuery({
  projectId: process.env.BQTAP_PROJECT_ID,
  credentials,
});

async function queryTable() {
  try {
    const query = `
      SELECT timestamp, level, message, args, metadata
      FROM \`${process.env.BQTAP_PROJECT_ID}.${process.env.BQTAP_DATASET}.${process.env.BQTAP_TABLE}\`
      ORDER BY timestamp DESC
      LIMIT 10
    `;

    const [rows] = await bigquery.query({ query });

    console.log(`\nFound ${rows.length} log entries in BigQuery:\n`);

    rows.forEach((row, index) => {
      console.log(`--- Log Entry ${index + 1} ---`);
      console.log(`Timestamp: ${row.timestamp.value}`);
      console.log(`Level: ${row.level}`);
      console.log(`Message: ${row.message}`);
      console.log(`Args: ${row.args}`);
      console.log(`Metadata: ${row.metadata}`);
      console.log();
    });
  } catch (error) {
    console.error('Error querying table:', error.message);
  }
}

queryTable();
