var AWS = require('aws-sdk');

exports.handler = function (event, context) {
  console.log("Stationeering: ECS Fetcher Task Invoker...");
  var ecs = new AWS.ECS();

  var params = {
    launchType: "FARGATE",
    cluster: event.cluster,
    taskDefinition: event.task,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: event.subnets,
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
