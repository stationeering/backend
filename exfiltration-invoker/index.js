var AWS = require('aws-sdk');

exports.handler = function (event, context) {
  console.log("Stationeering: ECS Exfiltration Task Invoker...");
  var config = JSON.parse(process.env.CONFIG);

  var branch = event.branch || "public";

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
    },
    overrides: {
      containerOverrides: [
        {
          name: 'exfiltration',
          environment: [
            {
              name: 'BRANCH',
              value: branch
            }
          ]
        }
      ]
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
