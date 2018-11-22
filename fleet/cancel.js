const ora = require('ora')
const AWS = require('aws-sdk')
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

module.exports = async (spotFleet, { keepTags }) => {
  const cfg = await config.load()

  const canceling = ec2
    .cancelSpotFleetRequests({
      SpotFleetRequestIds: [spotFleet],
      TerminateInstances: true
    })
    .promise()

  const removingTags = extendedSource.deleteFleet({
    config: cfg,
    SpotFleetRequestId: spotFleet
  })

  ora.promise(canceling, 'Canceling Spot Fleet...')
  await canceling

  if (keepTags || !cfg.extend_source) return

  ora.promise(removingTags, 'Removing tags from extended source...')
  await removingTags
}
