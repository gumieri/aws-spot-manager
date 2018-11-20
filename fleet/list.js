const AWS = require('aws-sdk')
const columnify = require('columnify')
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')

function formatLine ({ data, extendedData }) {
  const line = {
    ID: data.SpotFleetRequestId
  }

  for (const { Tags, ID } of extendedData) {
    if (data.SpotFleetRequestId === ID) {
      for (const { Key, Value } of Tags) {
        line[Key] = Value
      }
      break
    }
  }

  return Object.assign(line, {
    status: data.ActivityStatus,
    'allocation strategy': data.SpotFleetRequestConfig.AllocationStrategy,
    'fulfilled capacity': data.SpotFleetRequestConfig.FulfilledCapacity,
    'target capacity': data.SpotFleetRequestConfig.TargetCapacity,
    'request type': data.SpotFleetRequestConfig.Type,
    state: data.SpotFleetRequestState,
    'created at': data.CreateTime
  })
}

module.exports = async ({ noHeaders }) => {
  const cfg = await config.load()

  const extendedData = await extendedSource.fleet({ config: cfg })

  let NextToken

  const SpotFleetRequestConfigs = []
  do {
    const data = await ec2.describeSpotFleetRequests().promise()
    NextToken = data.NextToken
    SpotFleetRequestConfigs.push(...data.SpotFleetRequestConfigs)
  } while (NextToken)

  const outputData = SpotFleetRequestConfigs.map(data =>
    formatLine({ data, extendedData })
  )

  console.log(columnify(outputData, { showHeaders: !noHeaders }))
}
