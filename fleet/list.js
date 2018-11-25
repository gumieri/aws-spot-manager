const AWS = require('aws-sdk')
const moment = require('moment')
const columnify = require('columnify')

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

function formatLine ({ data, extendedData, date, strategy, requestType }) {
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

  line['Capacity'] =
    data.SpotFleetRequestConfig.FulfilledCapacity +
    '/' +
    data.SpotFleetRequestConfig.TargetCapacity

  line['Status'] = data.ActivityStatus

  if (requestType) line['Request Type'] = data.SpotFleetRequestConfig.Type

  if (strategy) {
    line['Allocation Strategy'] = data.SpotFleetRequestConfig.AllocationStrategy
  }

  line['State'] = data.SpotFleetRequestState

  if (date) line['Created At'] = moment(data.CreateTime).format()

  return line
}

module.exports = async ({
  headers = true,
  state,
  date,
  strategy,
  region,
  requestType
}) => {
  const cfg = await config.load()

  if (!region) region = cfg.region

  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15', region })

  const extendedData = await extendedSource.allFleets({ config: cfg })

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
    outputData.push(
      formatLine({ data, extendedData, date, strategy, requestType })
    )
  }

  console.log(
    columnify(outputData, {
      showHeaders: headers,
      config: {
        Capacity: { align: 'right' }
      }
    })
  )
}
