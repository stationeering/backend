var AWS = require('aws-sdk');
var SSM = new AWS.SSM();
var ecs = new AWS.ECS();

exports.handler = async function (event, context) {
  console.log("Stationeering: ECS Fetcher Task Invoker...");

  console.log("Stationeering: Invoking ECS!");

  var interval = event.interval || (25 * 60 * 1000);

  if (await checkIfNeedToRun(interval)) {
    console.log("Stationeering: Poll needed.");

    if (await launchFetcherTask()) {
      context.succeed("Stationeering: Launched.");
    } else {
      context.fail("Stationeering: Launching failed!");
    }
  } else {
    console.log("Stationeering: No poll needed.");
    context.succeed("Stationeering: Not needed.");
  }
};

async function checkIfNeedToRun(minimumInterval) {
  var mustBeBefore = Date.now() - minimumInterval;

  try {
    var ssmResponse = await SSM.getParameter({ Name: "/fetcher/last_poll" }).promise();
    var lastRun = Number.parseInt(ssmResponse.Parameter.Value);

    if (lastRun >= mustBeBefore) {
      console.log("Stationeering: " + mustBeBefore + " > " + lastRun + ", interval was " + minimumInterval + ", poll not required.");
      return false; 
    }
  } catch (err) {
    console.log("Stationeering: Failed to get last poll parameter!");
    console.log(err, err.stack);
    return false;
  }

  try {
    console.log("Stationeering: Updating last poll parameter.");
    var ssmResponse = await SSM.putParameter({ Name: "/fetcher/last_poll", Type: "String", Value: Date.now().toString(), Overwrite: true }).promise();
    console.log("Stationeering: Updated.");
  } catch (err) {
    console.log("Stationeering: Failed to update the last poll parameter!");
    console.log(err, err.stack);
    return false;
  }

  return true;
}

async function launchFetcherTask() {
  var params = {
    launchType: "FARGATE",
    cluster: process.env.cluster,
    taskDefinition: process.env.task,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [process.env.subnet1a, process.env.subnet1b, process.env.subnet1c],
        assignPublicIp: "ENABLED"
      }
    }
  };

  try {
    var result = await ecs.runTask(params).promise();
    console.log("Stationeering: Task run request successful!");
    console.log("Stationeering: Container Instance ARN: " + result.tasks[0].containers[0].containerArn);
    return true;
  } catch (err) {
    console.log("Stationeering: Failed to run ECS task!");
    console.log(err, err.stack);
    return false;
  }
}  
