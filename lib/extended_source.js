const AWS = require('aws-sdk')
const arn = require('./arn')

async function fleet ({ config: { extend_source: extendedSource } }) {
  if (!extendedSource) return []
  const { region, resourceId: TableName } = arn.parse(extendedSource)
  const documentClient = new AWS.DynamoDB.DocumentClient({ region })
  const { Items } = await documentClient.scan({ TableName }).promise()
  return Items
}

module.exports = {
  fleet
}
