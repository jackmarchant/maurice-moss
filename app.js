const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const app = express();
const jsonParser = bodyParser.json();
const fetch = require('node-fetch');

// Setup logger
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms'));

app.get('/', (req, res) => {
  res.send('hello world');
});

const validate = (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === process.env.VALIDATE_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
};

app.get('/webhook', validate);

const callSendAPI = (messageData) => {
  const statusCheck = res => {
    if (res.status !== 200) {
      let error = new Error();
      error.message = res.error.message;
      throw error;
    }
    return res;
  };
  fetch(
    `https://graph.facebook.com/v2.6/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(messageData)
    })
    .then(statusCheck)
    .then(res => res.json())
    .then(res => {
      const recipientId = res.recipient_id;
      const messageId = res.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    })
    .catch(error => {
      console.error("Unable to send message.");
      console.error(error.message);
    });
};

const sendTextMessage = (recipientId, messageText) => {
  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
};

const sendTemplateMessage = (recipientId, {title, url, buttonText}) => {
  const messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: title,
            buttons: [{
              type: "web_url",
              url: url,
              title: buttonText
            }],
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
};

const receivedMessage = (event) => {
  const senderID = event.sender.id;
  const recipientID = event.recipient.id;
  const timeOfMessage = event.timestamp;
  const message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  const messageId = message.mid;

  const messageText = message.text;
  const messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText.toLowerCase()) {
      case 'weather':
        return sendTemplateMessage(senderID, {
          title: 'Sydney Weather',
          url: 'https://www.google.com.au/search?q=weather+in+sydney&oq=weather+&aqs=chrome.0.69i59j69i60j69i57j0l2j69i60.1027j0j7&sourceid=chrome&ie=UTF-8',
          buttonText: 'See Weather',
        });
      case 'dessert':
        return sendTextMessage(senderID, `Would I blow your mind if I ate dessert, first!?`);
      default:
        return sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
};

app.post('/webhook', jsonParser, (req, res) => {
  const data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach((entry) => {
      const pageID = entry.id;
      const timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach((event) => {
        if (event.message) {
          receivedMessage(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });
  }
  res.sendStatus(200);
});

module.exports = app;