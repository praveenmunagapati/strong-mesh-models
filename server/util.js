// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-mesh-models
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var crypto = require('crypto');

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
exports.genToken = genToken;
