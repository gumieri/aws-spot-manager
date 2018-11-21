const AWS = require('aws-sdk')
const moment = require('moment')
const columnify = require('columnify')
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

function formatLine ({ data, extendedData }) {
  const line = {}

  line['ID'] = data.SpotFleetRequestId

  for (const { Tags, ID } of extendedData) {
    if (data.SpotFleetRequestId === ID) {
      for (const { Key, Value } of Tags) {
        line[Key] = Value
      }
      break
    }
  }

  line['Fulfilled Capacity'] = data.SpotFleetRequestConfig.FulfilledCapacity
  line['Target Capacity'] = data.SpotFleetRequestConfig.TargetCapacity
  line['Status'] = data.ActivityStatus
  line['Request Type'] = data.SpotFleetRequestConfig.Type
  line['Allocation Strategy'] = data.SpotFleetRequestConfig.AllocationStrategy
  line['State'] = data.SpotFleetRequestState
  line['Created At'] = moment(data.CreateTime).format()

  return line
}

module.exports = async ({ headers = true, state }) => {
  const cfg = await config.load()

  const extendedData = await extendedSource.fleet({ config: cfg })

  let NextToken
  const SpotFleetRequestConfigs = []
  do {
    const data = await ec2.describeSpotFleetRequests().promise()
    NextToken = data.NextToken
    SpotFleetRequestConfigs.push(...data.SpotFleetRequestConfigs)
  } while (NextToken)

  const states = stringArrayOrEmpty(state)

  const outputData = []
  for (data of SpotFleetRequestConfigs) {
    if (states.length > 0) {
      if (!states.includes(data.SpotFleetRequestState)) continue
    }
    outputData.push(formatLine({ data, extendedData }))
  }

  console.log(columnify(outputData, { showHeaders: headers }))
}
