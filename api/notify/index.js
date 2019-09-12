var AWS = require('aws-sdk');
var SSM = new AWS.SSM();
var lambda = new AWS.Lambda();

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
  
  console.log("Notification validated from '" + user + "'. Attempting to invoke Fetcher lambda.");

  try {
    var params = { 
      FunctionName: process.env.FetcherInvokerARN,
      InvocationType: "Event",
      Payload: "{ \"interval\": 300000 }"
    };
    
    var lambdaResult = await lambda.invoke(params).promise();
    
    log("Invocation success! " + JSON.stringify(lambdaResult));
    
    callback(null, { "body": "OK" });
  } catch (err) {
      log("Failed to invoke fetcher lambda.");
      log(err);
      callback(new Error("Failure"));
  }
};
