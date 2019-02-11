const fs = require('fs')
const ora = require('ora')
const AWS = require('aws-sdk')
const chalk = require('chalk')
const { toOrdinal } = require('ordinal-js')
const { prompt } = require('enquirer')

const config = require('../lib/config')
const { spotFleet: spotFleetUserData } = require('../lib/user_data')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty, requiredInput } = require('../lib/utils')

const requiredWord = chalk.red.bold('REQUIRED')
const optionalWord = chalk.green.bold('OPTIONAL')

async function forAsk ({ message, validate }, loopFunction) {
  const responses = []
  for (let i = 0; ; i++) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message,
      validate
    })
    if (!response) break

    responses.push(response)

    result = await loopFunction({ i, response, responses })
    message = result.message
    validate = result.validate
  }

  return responses
}

async function findSubnet ({ ec2, Subnet }) {
  const { Subnets: byId } = await ec2
    .describeSubnets({ Filters: [{ Name: 'subnet-id', Values: [Subnet] }] })
    .promise()

  if (byId.length > 0) return byId[0]

  const { Subnets: byName } = await ec2
    .describeSubnets({ Filters: [{ Name: 'tag:Name', Values: [Subnet] }] })
    .promise()

  if (byName.length > 0) return byName[0]

  throw new Error(`The subnet with name/id ${Subnet} cannot be found.`)
}

async function findSecurityGroup ({ ec2, SecurityGroup, VpcId }) {
  const { SecurityGroups: byId } = await ec2
    .describeSecurityGroups({
      Filters: [
        { Name: 'group-id', Values: [SecurityGroup] },
        { Name: 'vpc-id', Values: [VpcId] }
      ]
    })
    .promise()

  if (byId.length > 0) return byId[0]

  const { SecurityGroups: byGroupName } = await ec2
    .describeSecurityGroups({
      Filters: [
        { Name: 'group-name', Values: [SecurityGroup] },
        { Name: 'vpc-id', Values: [VpcId] }
      ]
    })
    .promise()

  if (byGroupName.length > 0) return byGroupName[0]

  const { SecurityGroups: byName } = await ec2
    .describeSecurityGroups({
      Filters: [
        { Name: 'tag:Name', Values: [SecurityGroup] },
        { Name: 'vpc-id', Values: [VpcId] }
      ]
    })
    .promise()

  if (byName.length > 0) return byName[0]

  throw new Error(
    `The security group with name/group name/id ${subnet} cannot be found.`
  )
}

async function findLatestAmiEcsOptimized ({ ec2 }) {
  const { Images } = await ec2
    .describeImages({
      Filters: [
        { Name: 'state', Values: ['available'] },
        { Name: 'owner-alias', Values: ['amazon'] },
        { Name: 'name', Values: ['amzn-ami-?????????-amazon-ecs-optimized'] }
      ]
    })
    .promise()

  let latest
  for (image of Images) {
    if (!latest || image.CreationDate > latest.CreationDate) {
      latest = image
      continue
    }
  }

  return latest
}

async function checkECSCluster ({ cluster, ecs }) {
  const { clusters } = await ecs
    .describeClusters({ clusters: [cluster] })
    .promise()

  if (clusters.length === 0) {
    throw new Error(`The ECS Cluster with name ${cluster} cannot be found.`)
  }

  return clusters[0]
}

module.exports = async ({
  k,
  n,
  g,
  c = 1,
  i,
  t,
  key = k,
  tag = t,
  subnet = n,
  instanceType = i,
  securityGroup = g,
  targetCapacity = c,
  ami,
  ebs,
  region,
  spotPrice,
  userData,
  fleetRole,
  ecsCluster,
  monitoring,
  instanceProfile,
  allocationStrategy,
  interactive = true
}) => {
  const cfg = await config.load()

  if (!region) region = cfg.region

  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15', region })
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region })
  const iam = new AWS.IAM({ apiVersion: '2010-05-08', region })

  if (!fleetRole) {
    if (ecsCluster) {
      fleetRole = 'ecsSpotFleetRole'
    } else {
      fleetRole = 'aws-ec2-spot-fleet-tagging-role'
    }
  }

  if (!instanceProfile && ecsCluster) {
    instanceProfile = 'ecsInstanceRole'
  }

  if (ecsCluster) {
    if (typeof ecsCluster !== 'string') ecsCluster = 'default'
    const checkingECSCluster = checkECSCluster({ cluster: ecsCluster, ecs })
    ora.promise(checkingECSCluster, 'Checking ECS Cluster...')
    await checkingECSCluster
  }

  if (!ami && ecsCluster) {
    const searchingECSAMI = findLatestAmiEcsOptimized({ ec2 })
    ora.promise(searchingECSAMI, 'Searching Latest ECS Optimized AMI...')
    const image = await searchingECSAMI
    if (image) ami = image.ImageId
  }

  if (!userData && ecsCluster) {
    userData = spotFleetUserData({ cluster: ecsCluster, region })
  }

  const SpotPrice = spotPrice
  const Monitoring = monitoring
  const TargetCapacity = targetCapacity

  const tags = stringArrayOrEmpty(tag)
  const subnets = stringArrayOrEmpty(subnet)
  const instanceTypes = stringArrayOrEmpty(instanceType)
  const securityGroups = stringArrayOrEmpty(securityGroup)

  // Ask for missing information

  if (interactive && !ami) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message: `Inform a Image ID (e.g. "ami-1a2b3c4d") ${requiredWord}`,
      validate: requiredInput
    })

    if (response) ami = response
  }

  if (interactive && instanceTypes.length === 0) {
    const responses = await forAsk(
      {
        message: `Inform a Instance Type (e.g. "t2.small") ${requiredWord}`,
        validate: requiredInput
      },
      ({ i }) => ({
        message: `Inform a ${toOrdinal(i + 2)} Instance Type ${optionalWord}`,
        validate: undefined
      })
    )

    instanceTypes.push(...responses)
  }

  if (interactive && subnets.length === 0) {
    const responses = await forAsk(
      {
        message: `Inform a Subnet ID or Name Tag (e.g. "subnet-1a2b3c4d") ${requiredWord}`,
        validate: requiredInput
      },
      ({ i }) => ({
        message: `Inform a ${toOrdinal(i + 2)} Subnet ${optionalWord}`,
        validate: undefined
      })
    )

    subnets.push(...responses)
  }

  if (interactive && securityGroups.length === 0) {
    const responses = await forAsk(
      {
        message: `Inform a Security Group ID, Group Name or Name Tag (e.g. "sg-1a2b3c4d") ${optionalWord}`
      },
      ({ i }) => ({
        message: `Inform a ${toOrdinal(i + 2)} Security Group ${optionalWord}`
      })
    )

    securityGroups.push(...responses)
  }

  if (interactive && tags.length === 0) {
    const responses = await forAsk(
      {
        message: `Inform a Tag with value (e.g. "Name=Awesome") ${optionalWord}`
      },
      ({ i }) => ({
        message: `Inform a ${toOrdinal(i + 2)} Tag ${optionalWord}`
      })
    )

    tags.push(...responses)
  }

  if (interactive && !key) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message: `Inform the Key name for remote access ${optionalWord}`
    })

    if (response) key = response
  }

  // Check parameters

  const checkRole = iam.getRole({ RoleName: fleetRole }).promise()
  ora.promise(checkRole, 'Checking IAM Role...')
  const { Role: { Arn: IamFleetRole } } = await checkRole

  let IamInstanceProfile
  if (instanceProfile) {
    const checkProfile = iam
      .getInstanceProfile({ InstanceProfileName: instanceProfile })
      .promise()
    ora.promise(checkProfile, 'Checking Instance Profile...')
    const data = await checkProfile
  }

  const findAllSubnets = Promise.all(
    subnets.map(Subnet => findSubnet({ ec2, Subnet }))
  )
  ora.promise(findAllSubnets, 'Checking Subnets...')

  let singleVpcId
  const SubnetIds = []
  for (const { SubnetId, VpcId } of await findAllSubnets) {
    SubnetIds.push(SubnetId)

    if (singleVpcId && singleVpcId !== VpcId) {
      throw new Erro('The informed Subnets are from different VPCs.')
    }

    singleVpcId = VpcId
  }

  let SecurityGroups
  if (securityGroups.length > 0) {
    const findAllSecurityGroups = Promise.all(
      securityGroups.map(SecurityGroup =>
        findSecurityGroup({ ec2, SecurityGroup, VpcId: singleVpcId })
      )
    )
    ora.promise(findAllSecurityGroups, 'Checking Security Groups...')
    SecurityGroups = (await findAllSecurityGroups).map(({ GroupId }) => ({
      GroupId
    }))
  }

  let TagSpecifications
  if (tags.length !== 0) {
    TagSpecifications = [{ ResourceType: 'instance', Tags: [] }]
    for (const t of tags) {
      const [Key, Value] = t.split('=')
      TagSpecifications[0].Tags.push({ Key, Value })
    }
  }

  // Mount and request

  const LaunchSpecifications = []
  for (const it of instanceTypes) {
    LaunchSpecifications.push({
      ImageId: ami,
      KeyName: key,
      UserData: userData,
      SubnetId: SubnetIds.join(','),
      Monitoring,
      EbsOptimized: ebs,
      InstanceType: it,
      SecurityGroups,
      TagSpecifications,
      IamInstanceProfile
    })
  }

  const requestPromise = ec2
    .requestSpotFleet({
      SpotFleetRequestConfig: {
        IamFleetRole,
        LaunchSpecifications,
        SpotPrice,
        TargetCapacity
      }
    })
    .promise()

  ora.promise(requestPromise, 'Requesting Spot Fleet...')
  const { SpotFleetRequestId } = await requestPromise

  if (cfg.extend_source && tags.length !== 0) {
    const savingTags = extendedSource.putFleetTags({
      config: cfg,
      SpotFleetRequestId,
      Tags: TagSpecifications[0].Tags
    })
    ora.promise(savingTags, 'Saving Tags for the Spot Fleet...')
    await savingTags
  }
}
