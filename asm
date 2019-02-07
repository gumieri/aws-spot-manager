#!/usr/bin/env node

const lib2cli = require('lib2cli')

lib2cli.run({
  description:
    'Command line tool for managing AWS spot fleet & instance requests',
  commands: {
    fleet: require('./fleet'),
    instances: {
      command: () => {
        throw new Error('Not yet implemented.')
      },
      description: 'Manage spot instances requests. Not yet implemented'
    }
  }
})
