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
  stringArrayOrEmpty
}
