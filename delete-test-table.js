// Load environment variables from .env file
require('dotenv').config();

const { BigQuery } = require('@google-cloud/bigquery');

const credentials = JSON.parse(process.env.BQTAP_GOOGLE_API_CREDENTIALS);

const bigquery = new BigQuery({
  projectId: process.env.BQTAP_PROJECT_ID,
  credentials,
});

async function deleteTable() {
  try {
    await bigquery
      .dataset(process.env.BQTAP_DATASET)
      .table(process.env.BQTAP_TABLE)
      .delete();

    console.log(`Deleted table ${process.env.BQTAP_DATASET}.${process.env.BQTAP_TABLE}`);
  } catch (error) {
    console.error('Error deleting table:', error.message);
  }
}

deleteTable();
