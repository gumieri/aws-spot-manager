const ora = require('ora')
const AWS = require('aws-sdk')
const chalk = require('chalk')
const { prompt } = require('enquirer')
const { requiredInput } = require('../lib/utils')

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

module.exports = async (spotFleets, { keepTags, region }) => {
  const cfg = await config.load()

  if (!region) region = cfg.region

  spotFleets = stringArrayOrEmpty(spotFleets)
  if (spotFleets.length === 0) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message: `Inform the Spot Fleet ID (e.g. "sfr-1a2b3c4d5e6f7g8h9i0k") ${chalk.bold.red(
        'REQUIRED'
      )}`,
      validate: requiredInput
    })

    if (response) spotFleets = response
  }

  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15', region })
  const canceling = ec2
    .cancelSpotFleetRequests({
      SpotFleetRequestIds: spotFleets,
      TerminateInstances: true
    })
    .promise()

  ora.promise(canceling, 'Canceling Spot Fleet...')
  await canceling

  if (keepTags || !cfg.extend_source) return

  const removingTags = Promise.all(
    spotFleets.map(spotFleet =>
      extendedSource.deleteFleet({
        config: cfg,
        SpotFleetRequestId: spotFleet
      })
    )
  )

  ora.promise(removingTags, 'Removing tags from extended source...')
  await removingTags
}
