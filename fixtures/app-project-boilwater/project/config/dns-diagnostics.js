const { exec } = require('child_process');

function buildDnsLookupCommand(hostname) {
  return `getent hosts "${hostname}"`;
}

exports.resolveHostname = (hostname, callback) => {
  const lookupCommand = hostname && buildDnsLookupCommand(String(hostname));
  exec(lookupCommand, callback);
};
