const os = require('os')
const fs = require('fs')
const path = require('path')

async function load () {
  try {
    const configPath = path.join(os.homedir(), '.asm.json')
    const configString = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(configString)
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
