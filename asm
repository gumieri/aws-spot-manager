#!/usr/bin/env node

const lib2cli = require('lib2cli')

lib2cli.run({
  lib: {
    fleet: {
      list: require('./fleet/list'),
      request: require('./fleet/request')
    }
  },
  doc: {
    description:
      'Command line tool for managing AWS spot fleet & instance requests',
    commands: {
      fleet: {
        description: 'Manage spot fleet requests.',
        commands: {
          list: {
            description: 'List spot fleet requests.',
            flags: {
              state: {
                description: 'filter by state'
              },
              'no-headers': {
                description: "Does not print headers' table."
              }
            }
          },
          request: {
            description: 'Requests a spot fleet.',
            flags: {
              key: {
                description: 'the SSH key for accessing the EC2 Instance.',
                alias: 'k'
              },
              tag: {
                description: 'Tag the EC2 Instance informing "key=value".',
                alias: 't'
              },
              subnet: {
                description: 'Inform a Subnet ID or Name Tag.',
                alias: 'n',
                required: true
              },
              'instance-type': {
                description: 'e.g. "c5.large"',
                alias: 'i',
                required: true
              },
              'security-group': {
                description:
                  'Inform a Security Group ID, Group Name or Name Tag.',
                alias: 'g',
                required: true
              },
              'target-capacity': {
                description: 'Number to be fulfilled by instances.',
                defaultValue: 1
              },
              ami: {},
              ebs: {},
              'spot-price': {},
              'user-data': {},
              'fleet-role': {
                defaultValue: 'aws-ec2-spot-fleet-tagging-role'
              },
              'ecs-cluster': {},
              monitoring: {
                defaultValue: false
              },
              'instance-profile': {},
              'allocation-strategy': {}
            }
          }
        }
      }
    }
  }
})
