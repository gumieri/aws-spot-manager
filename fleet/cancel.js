const ora = require('ora')
const AWS = require('aws-sdk')
const chalk = require('chalk')
const { prompt } = require('enquirer')
const { requiredInput } = require('../lib/utils')

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

module.exports = async ({ keepTags, region }, spotFleet) => {
  const cfg = await config.load()

  if (!region) region = cfg.region

  if (!spotFleet) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message: `Inform the Spot Fleet ID (e.g. "sfr-1a2b3c4d5e6f7g8h9i0k") ${chalk.bold.red(
        'REQUIRED'
      )}`,
      validate: requiredInput
    })

    if (response) spotFleet = response
  }

  if (!spotFleet) throw new Error()

  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15', region })
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
