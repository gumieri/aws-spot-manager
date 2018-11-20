const components = [
  'arn',
  'aws',
  'service',
  'region',
  'namespace',
  'relativeId'
]

const parse = string => {
  if (!string) return {}

  const data = string.split(':').reduce((result, part, idx) => {
    result[components[idx]] = part
    return result
  }, {})

  const [resourceType, resourceId] = data.relativeId.split('/')
  data.resourceType = resourceType
  data.resourceId = resourceId

  return data
}

module.exports = {
  parse
}
