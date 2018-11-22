const AWS = require('aws-sdk')
const arn = require('./arn')

async function allFleets ({ config: { extend_source: extendSource } }) {
  if (!extendSource) return []

  const { region, resourceId: TableName } = arn.parse(extendSource)
  const documentClient = new AWS.DynamoDB.DocumentClient({ region })
  const { Items } = await documentClient.scan({ TableName }).promise()

  return Items
}

async function deleteFleet ({
  config: { extend_source: extendSource },
  SpotFleetRequestId
}) {
  if (!extendSource) return

  const { region, resourceId: TableName } = arn.parse(extendSource)
  const documentClient = new AWS.DynamoDB.DocumentClient({ region })
  return documentClient
    .delete({ TableName, Key: { ID: SpotFleetRequestId } })
    .promise()
}

async function putFleetTags ({
  config: { extend_source: extendSource },
  Tags,
  SpotFleetRequestId
}) {
  if (!extendSource) return

  const { region, resourceId: TableName } = arn.parse(extendSource)
  const documentClient = new AWS.DynamoDB.DocumentClient({ region })
  const { Item } = await documentClient
    .put({
      TableName,
      Item: {
        ID: SpotFleetRequestId,
        Region: region,
        Tags
      }
    })
    .promise()

  return Item
}

module.exports = {
  deleteFleet,
  allFleets,
  putFleetTags
}
