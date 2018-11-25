const os = require('os')
const fs = require('fs')
const AWS = require('aws-sdk')
const path = require('path')

async function load () {
  try {
    const configPath = path.join(os.homedir(), '.asm.json')
    const configString = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(configString)

    if (!config.region) {
      config.region = AWS.config.region
    }

    return config
  } catch (err) {
    switch (err.code) {
      case 'ENOENT':
        return {}
      default:
        throw err
    }
  }
}

module.exports = {
  load
}
