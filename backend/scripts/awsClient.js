const AWS = require('aws-sdk');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isPlaceholderKey = (value) =>
  !value || value.includes('your_') || value.includes('YOUR_');

function configureAws() {
  const region = process.env.AWS_REGION || 'us-east-1';

  if (
    !isPlaceholderKey(process.env.AWS_ACCESS_KEY_ID) &&
    !isPlaceholderKey(process.env.AWS_SECRET_ACCESS_KEY)
  ) {
    AWS.config.update({
      region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  } else {
    // Fall back to AWS CLI profile (~/.aws/credentials) or instance role
    AWS.config.update({ region });
  }

  return AWS;
}

async function verifyAwsCredentials() {
  configureAws();
  const sts = new AWS.STS();
  const identity = await sts.getCallerIdentity().promise();
  return {
    account: identity.Account,
    arn: identity.Arn,
    userId: identity.UserId,
  };
}

module.exports = {
  configureAws,
  verifyAwsCredentials,
  isPlaceholderKey,
};
