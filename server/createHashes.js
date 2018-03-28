var crypto = require('crypto')
  , text = process.argv[2]
  , key = 'a secret'
  , hash

hash = crypto.createHmac('sha256', key).update(text).digest('hex');
console.log(hash);