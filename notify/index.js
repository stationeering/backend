var AWS = require('aws-sdk');
var SSM = new AWS.SSM();

function log(content) {
  console.log("Stationeering: " + content);
}

exports.handler = async function (event, context, callback) {
  var user = event.parameters.user;
  var key = event.parameters.key;

  try {
    var ssmResponse = await SSM.getParameter({ Name: "/notify/user/" + user, WithDecryption: true }).promise();

    if (!ssmResponse.Parameter || ssmResponse.Parameter.Value !== key) {
      context.succeed("Forbidden");
      return;
    }
  } catch (err) {
    if (err.code === "ParameterNotFound") {
      callback(new Error("Forbidden"));
    } else {
      log("Failed to fetch parameters from SSM.");
      log(err);
      callback(new Error("Failure"));
    }
    return;
  }

  callback(null, { "body": "OK" });
};
