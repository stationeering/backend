var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var FlakeId = require('flake-idgen');
var Base58 = require('bs58');
var intformat = require('biguint-format');

var flakeGenerator;

exports.handler = async function (event, context, callback) {
  if (!flakeGenerator) {
    var id = parseInt(context.awsRequestId.substring(0,4), 16) % 1024;
    flakeGenerator = new FlakeId({ id: id, epoch: 1535760000000 });
  }

  var newId = flakeGenerator.next();
  
  var linkId = intformat(newId, 'dec');
  var createdAt = Date.now().toString(); 
  var state = event.body.state;
  
  var link = "_" + Base58.encode(newId);

  var params = {
    Item: {
        "link": {
            N: linkId
        },
        "created_at": {
            N: createdAt
        },
        "state": {
            S: state
        }
    },
    TableName: "Permalinks"
  };

  try {
      await DynamoDB.putItem(params).promise();    
  } catch (err) {
      console.log(err);
      callback(new Error("Persistence Failure."));
  }

  var response = {
    body: { id: link }
  };
  
  callback(null, response);
};