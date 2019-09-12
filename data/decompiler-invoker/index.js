var AWS = require('aws-sdk');

exports.handler = function (event, context) {
  console.log("Stationeering: ECS Decompiler Task Invoker...");
  var config = JSON.parse(process.env.CONFIG);

  if (event.Records[0].EventSource === "aws:sns") {
      console.log("Notification in an SNS envelope, removing and parsing JSON.");
      event = JSON.parse(event.Records[0].Sns.Message);
  }

  var key = event.Records[0].s3.object.key;
  var operation = event.Records[0].eventName;
 
  if (!operation.startsWith("ObjectCreated") || key !== "beta/rocketstation_Data/Managed/Assembly-CSharp.dll") {
    context.succeed("Stationeering: Nothing to do, not suitable key (" + key + ").");
    return;
  }

  var ecs = new AWS.ECS();

  var params = {
    launchType: "FARGATE",
    cluster: config.cluster,
    taskDefinition: config.task,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.subnets,
        assignPublicIp: "ENABLED"
      }
    }
  };

  ecs.runTask(params, function (err, data) {
    if (err) {
      console.log("Stationeering: Failed to run ECS task!");
      console.log(err, err.stack);
      context.fail("Stationeering: Failed.");
    } else {
      console.log("Stationeering: Task run request successful!");
      console.log("Stationeering: Container Instance ARN: " + data.tasks[0].containers[0].containerArn);
      context.succeed("Stationeering: Completed.");
    }
  });
}  
