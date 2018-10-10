var AWS = require('aws-sdk');
var SSM = new AWS.SSM();

function log(content) {
  console.log("Stationeering: " + content);
}

exports.handler = async function (event, context, callback) {
  var user = event.parameters.user;
  var key = event.parameters.key;

  console.log("Notification receieved from '" + user + "'.");

  try {
    var ssmResponse = await SSM.getParameter({ Name: "/notify/user/" + user, WithDecryption: true }).promise();

    if (!ssmResponse.Parameter || ssmResponse.Parameter.Value !== key) {
      console.log("User provided incorrect key.");
      callback(new Error("Forbidden"));
      return;
    }
  } catch (err) {
    if (err.code === "ParameterNotFound") {
      console.log("User not found.");
      callback(new Error("Forbidden"));
    } else {
      log("Failed to fetch parameters from SSM.");
      log(err);
      callback(new Error("Failure"));
    }
    return;
  }
  
  console.log("Notification validated from '" + user + "'.");

  callback(null, { "body": "OK" });
};
