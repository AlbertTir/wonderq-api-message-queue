'use strict';
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

// dummy function, sanity checks, etc
module.exports.hello = async (event) => {
  console.log("Hello world from Serverless!");
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event,
      },
      null,
      2
    ),
  };
};

// API for developer tool, retrieves all records in database
module.exports.scanAll = async (event) => {
  console.log("Get all messages from database.");
  
  let params = {
    TableName: "Message",
  };

  let result = await docClient.scan(params, (err, data) => {
    if(err){
      console.error("Unable to scan the table. Error JSON: ", JSON.stringify(err, null, 2));
      return err;
    }else{
      console.log("Table scanned. JSON: ", JSON.stringify(data, null, 2));
      return data;
    }
  }).promise();

  return result;
};

// API for producers, takes string input and create a new message record in database
module.exports.writeMessage = async (event) => {
  console.log("Write a message to database.");
  let newId = uuidv4();
  let message = event.body.message;
  let createdOn = new Date(Date.now());

  if(!message){
    console.log("No message to record, enter a non-empty value");
    return;
  }

  let params = {
    TableName: "Message",
    Item: {
      'MessageId' : newId,
      'MessageContent' : message,
      'CreatedOn' : createdOn.toUTCString(),
      'Status' : "Available"
    }
  };

  console.log(params);
  let result = await docClient.put(params, (err, data) => {
    if(err){
      console.error("Unable to write to the table. Error JSON: ", JSON.stringify(err, null, 2));
      return err;
    }else{
      console.log("Message written. JSON: ", JSON.stringify(data, null, 2));
      return data;
    }
  }).promise();

  return {messageId: newId};
};


// API for generic update, specify list of items and status to update to
module.exports.updateItems = async (event) => {
  console.log("Updating items.");
  console.log(event.body.items);
  console.log(event.body.status);
  let items = !event.body ? null : event.body.items;
  let status = !event.body ? null : event.body.status;
  if(!items || items.length === 0){
    console.log("No items to update.");
    return;
  }

  console.log(items);
  await updateItems(items, status);
  
  return {result: "Item update completed for " + items};
};

// helper function for updateItems API, updates DynamoDB with the list of items provided and status target
const updateItems = async (items, status) => {
  for(let messageId of items){
    let params = {
      TableName: "Message",
      Key:{
        MessageId: messageId,
      },
      UpdateExpression: "set #s = :status",
      ExpressionAttributeNames: {"#s": "Status"},
      ExpressionAttributeValues:{
          ":status":status,
      },
      ReturnValues:"UPDATED_NEW"
    };
  
    console.log(params);

    let result = await docClient.update(params, (err, data) => {
      if(err){
        console.error("Unable to update the item. Error JSON: ", JSON.stringify(err, null, 2));
        return err;
      }else{
        console.log("Item updated. JSON: ", JSON.stringify(data, null, 2));
        return data;
      }
    }).promise();
  
    console.log(result);
  }
}


// fetches N number of items for consumers on page load
module.exports.fetchItems = async (event) => {
  console.log("Fetching items.");
  let limit = !event.query.limit ? 3 : event.query.limit;

  let params = {
    TableName: "Message",
    ProjectionExpression: "MessageId, MessageContent, #s",
    FilterExpression: "#s = :status",
    ExpressionAttributeNames: {"#s": "Status"},
    ExpressionAttributeValues: {
         ":status": "Available"
    }
  };

  let result = await docClient.scan(params, (err, data) => {
    if(err){
      console.error("Unable to scan the table. Error JSON: ", JSON.stringify(err, null, 2));
      return err;
    }else{
      console.log("Table scanned. JSON: ", JSON.stringify(data, null, 2));
      return data;
    }
  }).promise();

  // console.log(result.Items);
  // console.log(result.Items.slice(0,3).map(item => item.MessageId));

  await updateItems(result.Items.slice(0,limit).map(item => item.MessageId), "Reviewing");

  return result.Items.slice(0,limit);
};

// API for automated cleanup, runs every N minutes to clear out items stuck in Reviewing from unintentional user page refresh/exits
module.exports.cleanStuckItems = async (event) => {
  console.log("Clean up stuck items from database.");
  
  let params = {
    TableName: "Message",
    ProjectionExpression: "MessageId, MessageContent, #s",
    FilterExpression: "#s = :status",
    ExpressionAttributeNames: {"#s": "Status"},
    ExpressionAttributeValues: {
         ":status": "Reviewing"
    }
  };

  let result = await docClient.scan(params, (err, data) => {
    if(err){
      console.error("Unable to scan the table. Error JSON: ", JSON.stringify(err, null, 2));
      return err;
    }else{
      console.log("Table scanned. JSON: ", JSON.stringify(data, null, 2));
      return data;
    }
  }).promise();

  console.log(result.Items);
  console.log(result.Items.map(item => item.MessageId));

  await updateItems(result.Items.map(item => item.MessageId), "Available");

  return result;
};
