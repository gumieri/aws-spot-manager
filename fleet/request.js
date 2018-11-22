const fs = require('fs')
const ora = require('ora')
const AWS = require('aws-sdk')
const { prompt } = require('enquirer')
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })
const ecs = new AWS.ECS({ apiVersion: '2014-11-13' })
const iam = new AWS.IAM({ apiVersion: '2010-05-08' })

const config = require('../lib/config')
const extendedSource = require('../lib/extended_source')
const { stringArrayOrEmpty } = require('../lib/utils')

function spotFleetUserData ({ cluster }) {
  return `#!/bin/bash
echo ECS_CLUSTER=${cluster} >> /etc/ecs/ecs.config
echo ECS_BACKEND_HOST= >> /etc/ecs/ecs.config
export PATH=/usr/local/bin:$PATH
yum -y install jq
easy_install pip
pip install awscli
aws configure set default.region ${AWS.config.region}
cat <<EOF > /etc/init/spot-instance-termination-notice-handler.conf
description "Start spot instance termination handler monitoring script"
author "Amazon Web Services"
start on started ecs
script
echo \$\$ > /var/run/spot-instance-termination-notice-handler.pid
exec /usr/local/bin/spot-instance-termination-notice-handler.sh
end script
pre-start script
logger "[spot-instance-termination-notice-handler.sh]: spot instance termination
notice handler started"
end script
EOF
cat <<EOF > /usr/local/bin/spot-instance-termination-notice-handler.sh
#!/bin/bash
while sleep 5; do
	if [ -z \$(curl -Isf http://169.254.169.254/latest/meta-data/spot/termination-time)]; then
		/bin/false
	else
		logger "[spot-instance-termination-notice-handler.sh]: spot instance termination notice detected"
		STATUS=DRAINING
		ECS_CLUSTER=\$(curl -s http://localhost:51678/v1/metadata | jq .Cluster | tr -d \")
		CONTAINER_INSTANCE=\$(curl -s http://localhost:51678/v1/metadata | jq .ContainerInstanceArn | tr -d \")
		logger "[spot-instance-termination-notice-handler.sh]: putting instance in state \$STATUS"
		/usr/local/bin/aws  ecs update-container-instances-state --cluster \$ECS_CLUSTER --container-instances \$CONTAINER_INSTANCE --status \$STATUS
		logger "[spot-instance-termination-notice-handler.sh]: putting myself to sleep..."
		sleep 120 # exit loop as instance expires in 120 secs after terminating notification
	fi
done
EOF
chmod +x /usr/local/bin/spot-instance-termination-notice-handler.sh
`
}

async function findSubnet ({ Subnet }) {
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

async function findSecurityGroup ({ SecurityGroup, VpcId }) {
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

async function findLatestAmiEcsOptimized () {
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

function requiredInput (value) {
  if (typeof value === 'undefined') return false
  if (value === '') return false
  return true
}

async function checkECSCluster (cluster) {
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
  spotPrice,
  userData,
  fleetRole,
  ecsCluster,
  monitoring,
  instanceProfile,
  allocationStrategy
}) => {
  const cfg = await config.load()

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
    const checkingECSCluster = checkECSCluster(ecsCluster)
    ora.promise(checkingECSCluster, 'Checking ECS Cluster...')
    await checkingECSCluster
  }

  if (!ami && ecsCluster) {
    const searchingECSAMI = findLatestAmiEcsOptimized()
    ora.promise(searchingECSAMI, 'Searching Latest ECS Optimized AMI...')
    const image = await searchingECSAMI
    if (image) ami = image.ImageId
  }

  if (!userData && ecsCluster) {
    userData = Buffer.from(spotFleetUserData({ cluster: ecsCluster })).toString(
      'base64'
    )
  }

  const SpotPrice = spotPrice
  const Monitoring = monitoring
  const TargetCapacity = targetCapacity

  const tags = stringArrayOrEmpty(tag)
  const subnets = stringArrayOrEmpty(subnet)
  const instanceTypes = stringArrayOrEmpty(instanceType)
  const securityGroups = stringArrayOrEmpty(securityGroup)

  if (!ami) {
    const { response } = await prompt({
      type: 'input',
      name: 'response',
      message: 'Inform a Image ID (e.g. "ami-1a2b3c4d") - REQUIRED',
      validate: requiredInput
    })

    if (response) ami = response
  }

  if (instanceTypes.length === 0) {
    let message = 'Inform a Instance Type (e.g. "t2.small") - REQUIRED'
    let validate = requiredInput
    while (true) {
      const { response } = await prompt({
        type: 'input',
        name: 'response',
        message,
        validate
      })

      if (!response) break

      instanceTypes.push(response)
      message = 'Inform another Instance Type or let it empty'
      validate = undefined
    }
  }

  if (subnets.length === 0) {
    let message =
      'Inform a Subnet ID or Name Tag (e.g. "subnet-1a2b3c4d") - REQUIRED'
    let validate = requiredInput
    while (true) {
      const { response } = await prompt({
        type: 'input',
        name: 'response',
        message,
        validate
      })
      if (!response) break

      subnets.push(response)
      message = 'Inform another Subnet or let it empty'
      validate = undefined
    }
  }

  if (securityGroups.length === 0) {
    let message =
      'Inform a Security Group ID, Group Name or Name Tag (e.g. "sg-1a2b3c4d")'
    while (true) {
      const { response } = await prompt({
        type: 'input',
        name: 'response',
        message
      })
      if (!response) break

      securityGroups.push(response)
      message = 'Inform another Security Group or let it empty'
    }
  }

  if (tags.length === 0) {
    let message = 'Inform a Tag with value (e.g. "Name=Awesome")'
    while (true) {
      const { response } = await prompt({
        type: 'input',
        name: 'response',
        message
      })
      if (!response) break

      tags.push(response)
      message = 'Inform another Tag or let it empty'
    }
  }

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
    subnets.map(Subnet => findSubnet({ Subnet }))
  )
  ora.promise(findAllSubnets, 'Checking Subnets...')

  let singleVpcId
  const SubnetIds = []
  for (const { SubnetId, VpcId } of await findAllSubnets) {
    SubnetIds.push(SubnetId)
    singleVpcId = VpcId
  }

  const findAllSecurityGroups = Promise.all(
    securityGroups.map(SecurityGroup =>
      findSecurityGroup({ SecurityGroup, VpcId: singleVpcId })
    )
  )
  ora.promise(findAllSecurityGroups, 'Checking Security Groups...')
  const SecurityGroups = (await findAllSecurityGroups).map(({ GroupId }) => ({
    GroupId
  }))

  let TagSpecifications
  if (tags.length !== 0) {
    TagSpecifications = [{ ResourceType: 'instance', Tags: [] }]
    for (const t of tags) {
      const [Key, Value] = t.split('=')
      TagSpecifications[0].Tags.push({ Key, Value })
    }
  }

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
