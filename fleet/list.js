const AWS = require('aws-sdk')
const columnify = require('columnify')
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })

module.exports = async ({ noHeaders }) => {
  let NextToken

  const SpotFleetRequestConfigs = []
  do {
    const data = await ec2.describeSpotFleetRequests().promise()
    NextToken = data.NextToken
    SpotFleetRequestConfigs.push(...data.SpotFleetRequestConfigs)
  } while (NextToken)

  const outputData = SpotFleetRequestConfigs.map(data => ({
    ID: data.SpotFleetRequestId,
    status: data.ActivityStatus,
    'allocation strategy': data.SpotFleetRequestConfig.AllocationStrategy,
    'fulfilled capacity': data.SpotFleetRequestConfig.FulfilledCapacity,
    'target capacity': data.SpotFleetRequestConfig.TargetCapacity,
    'request type': data.SpotFleetRequestConfig.Type,
    state: data.SpotFleetRequestState,
    'created at': data.CreateTime
  }))

  console.log(columnify(outputData, { showHeaders: !noHeaders }))
}
