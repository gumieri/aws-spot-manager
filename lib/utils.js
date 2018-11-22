function requiredInput (value) {
  if (typeof value === 'undefined') return false
  if (value === '') return false
  return true
}

function stringArrayOrEmpty (s) {
  switch (typeof s) {
    case 'string':
      return [s]
    case 'object':
      if (Array.isArray(s)) return s
    default:
      return []
  }
}

module.exports = {
  stringArrayOrEmpty,
  requiredInput
}
