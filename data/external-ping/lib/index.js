var AWS = require('aws-sdk');
var SNS = new AWS.SNS();

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
    await ping();
}

async function ping() {
    var message = JSON.stringify({ operation: "ping" });
    var topic = process.env.TopicArn;

    try {
        await SNS.publish({ Message: message, TopicArn: topic }).promise();
        log("Publishing ping.")
    } catch (err) {
        log("Failed to ping: " + err)
    }
}