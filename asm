#!/usr/bin/env node

const lib2cli = require('lib2cli')

lib2cli.run({
  lib: {
    fleet: {
      list: require('./fleet/list')
    }
  },
  doc: {
    description:
      'Command line tool for managing AWS spot fleet & instance requests',
    commands: {
      fleet: {
        description: 'Manage spot fleet requests',
        commands: {
          list: {
            description: 'List spot fleet requests'
          }
        }
      }
    }
  }
})
