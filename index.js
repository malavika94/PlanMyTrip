/**
 Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 
 Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
 
 http://aws.amazon.com/apache2.0/
 
 or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * This sample shows how to create a Lambda function for handling Alexa Skill requests that:
 *
 * - Web service: communicate with an external web service to get events for specified days in history (Wikipedia API)
 * - Pagination: after obtaining a list of events, read a small subset of events and wait for user prompt to read the next subset of events by maintaining session state
 * - Dialog and Session state: Handles two models, both a one-shot ask and tell model, and a multi-turn dialog model.
 * - SSML: Using SSML tags to control how Alexa renders the text-to-speech.
 *
 * Examples:
 * One-shot model:
 * User:  "Alexa, ask Plan My Trip what happened on August thirtieth."
 * Alexa: "For August thirtieth, in 2003, [...] . Wanna go deeper in history?"
 * User: "No."
 * Alexa: "Good bye!"
 *
 * Dialog model:
 * User:  "Alexa, open Plan My Trip"
 * Alexa: "Plan My Trip. What day do you want events for?"
 * User:  "August thirtieth."
 * Alexa: "For August thirtieth, in 2003, [...] . Wanna go deeper in history?"
 * User:  "Yes."
 * Alexa: "In 1995, Bosnian war [...] . Wanna go deeper in history?"
 * User: "No."
 * Alexa: "Good bye!"
 */


/**
 * App ID for the skill
 */
var APP_ID = 'amzn1.ask.skill.c30f8cc9-b49f-4b3e-bbd2-064f45685a11';

var https = require('https');
var StringDecoder = require('string_decoder').StringDecoder;
var endpointLocation;

// Twilio Credentials
var accountSid = 'AC9c1e03067badf9d183f4fefb9c325ac4';
var authToken = 'ee665e4296ab896fc11e024aaa8f0e67';

/**
 * The AlexaSkill Module that has the AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');

/**
 * URL prefix to download history content from Wikipedia
 */
var urlRoutePrefix = 'https://www.mapquestapi.com/directions/v2/route?key=UShjaMayAC4UkuBJ5nu5rqFuraxzEOQU&from=';
var urlTrafficPrefix = 'https://www.mapquestapi.com/traffic/v2/incidents?key=UShjaMayAC4UkuBJ5nu5rqFuraxzEOQU&boundingBox=';

/**
 * Variable defining number of events to be read at one time
 */
var paginationSize = 3;

/**
 * Variable defining the length of the delimiter between events
 */
var delimiterSize = 2;

/**
 * PlanMyTripSkill is a child of AlexaSkill.
 * To read more about inheritance in JavaScript, see the link below.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript#Inheritance
 */
var PlanMyTripSkill = function() {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
PlanMyTripSkill.prototype = Object.create(AlexaSkill.prototype);
PlanMyTripSkill.prototype.constructor = PlanMyTripSkill;

PlanMyTripSkill.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("PlanMyTripSkill onSessionStarted requestId: " + sessionStartedRequest.requestId
                + ", sessionId: " + session.sessionId);
    
    // any session init logic would go here
};

PlanMyTripSkill.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("PlanMyTripSkill onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    getWelcomeResponse(response);
};

PlanMyTripSkill.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
                + ", sessionId: " + session.sessionId);
    
    // any session cleanup logic would go here
};

PlanMyTripSkill.prototype.intentHandlers = {
    
    "GetTrafficUpdatesIntent": function (intent, session, response) {
        handleTrafficUpdatesRequest(intent, session, response);
    },
    
    "GetTimeToArrivalIntent": function (intent, session, response) {
        handleTimeToArrivalRequest(intent, session, response);
    },
    
    "GetRemindMeIntent": function (intent, session, response) {
        handleRemindMeRequest(intent, session, response);
    },
    
    "GetTellFriendsIntent": function (intent, session, response) {
        handleTellFriendsRequest(intent, session, response);
    },
    
    "AMAZON.HelpIntent": function (intent, session, response) {
        var speechText = "With Plan My Trip, you can get traffic updates, find out distance and time to your chosen location, remind yourself to leave, and let your friends know of your E T A. " +
        "For example, you could say hows the traffic, what is my e t a to Levis Stadium, or you can say exit. Now, what would you like to do?";
        var repromptText = "What would you like to do?";
        var speechOutput = {
        speech: speechText,
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        var repromptOutput = {
        speech: repromptText,
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.ask(speechOutput, repromptOutput);
    },
    
    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = {
        speech: "Goodbye",
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.tell(speechOutput);
    },
    
    "AMAZON.CancelIntent": function (intent, session, response) {
        var speechOutput = {
        speech: "Goodbye",
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.tell(speechOutput);
    }
};

/**
 * Function to handle the onLaunch skill behavior
 */
function getFullAddress(endLocation) {
    switch (endLocation) {
        case "levis stadium":
            endpointLocation = "4900 Marie P DeBartolo Way, Santa Clara, CA";
            break;
        case "amazon san francisco office":
            endpointLocation = "475 Sansome St, San Francisco, CA";
            break;
        case "pier 39":
            endpointLocation = "Pier 39, San Francisco, CA";
            break;
        case "twin peaks":
            endpointLocation = "501 Twin Peaks Blvd, San Francisco, CA";
            break;
        case "google office":
            endpointLocation = "1600 Amphitheatre Parkway, Mountain View, CA";
            break;
        default:
            endpointLocation = "Pier 48, San Francisco, CA";
            break;
    }
}


function getWelcomeResponse(response) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    var cardTitle = "Plan My Trip";
    var repromptText = "Would you like to know how the traffic is?";
    var speechText = "<p>Plan My Trip.</p> <p>With Plan My Trip, you can get the traffic updates near you. For example, you could say traffic update, or are the roads bad. Now, would you like to know how the traffic is?</p>";
    var cardOutput = "Plan My Trip. Would you like to know how the traffic is?";
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    
    var speechOutput = {
    speech: "<speak>" + speechText + "</speak>",
    type: AlexaSkill.speechOutputType.SSML
    };
    var repromptOutput = {
    speech: repromptText,
    type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };
    response.askWithCard(speechOutput, repromptOutput, cardTitle, cardOutput);
}

/**
 * Gets a poster prepares the speech to reply to the user.
 */
function handleTrafficUpdatesRequest(intent, session, response) {
    var currentLocationBoundingBox = "37.00,-122.00,38.00,-123.00";
    
    var prefixContent = "The issues on the roads are these... ";
    var cardContent = "Plan this trip";
    var cardTitle = "Trippy trip trip"
    
    getJsonTrafficFromMapquest(currentLocationBoundingBox, function (events) {
                               var first = "<p>Firstly, </p>";
                               var second = "<p>Secondly, </p>";
                               var third = "<p>Lastly, </p>";
                               
                               speechTextOne = events[0].shortDesc;
                               speechTextTwo = events[1].shortDesc;
                               speechTextThree = events[2].shortDesc;
                               
                               var repromptText = "Would you like to know the traffic again?"
                               
                               if (events.length == 0) {
                               speechText = "There is a problem connecting to MapQuest at this time. Please try again later.";
                               cardContent = speechText;
                               response.tell(speechText);
                               } else {
                               var speechOutput = {
                               speech: "<speak>" + prefixContent + first + speechTextOne + ". " + second + speechTextTwo + ". " + third + speechTextThree + ". " + "</speak>",
                               type: AlexaSkill.speechOutputType.SSML
                               };
                               var repromptOutput = {
                               speech: repromptText,
                               type: AlexaSkill.speechOutputType.PLAIN_TEXT
                               };
                               response.askWithCard(speechOutput, repromptOutput, cardTitle, cardContent);
                               }
                               });
}

function getJsonTrafficFromMapquest(currentLocationBoundingBox, eventCallback) {
    var url = urlTrafficPrefix + currentLocationBoundingBox+ '&filters=construction,congestion';
    console.log(url);
    
    https.get(url, function(res) {
              var body = '';
              
              res.on('data', function (chunk) {
                     body += chunk;
                     });
              
              res.on('end', function () {
                     var stringResult = parseJsonTraffic(body);
                     console.log(stringResult);
                     eventCallback(stringResult);
                     });
              }).on('error', function (e) {
                    console.log("Got error: ", e);
                    });
}


function parseJsonTraffic(inputText) {
    // sizeOf (/nEvents/n) is 10
    retArr = [];
    var decoder = new StringDecoder('utf8');
    var rawData = decoder.write(inputText);
    var parsedData = JSON.parse(rawData);
    var incidents = parsedData["incidents"];
    console.log(incidents);
    //    //
    if (incidents.length == 0) {
        return retArr;
    }
    
    incidents.forEach(function(item) {
                      var road2 = item.parameterizedDescription.crossRoad2;
                      var shortDesc = item.shortDesc;
                      var delay = item.delayFromTypical;
                      
                      retArr.push({
                                  shortDesc: shortDesc,
                                  delay: delay
                                  });
                      });
    return retArr;
}

/**
 * Gets a poster prepares the speech to reply to the user.
 */
function handleTimeToArrivalRequest(intent, session, response) {
    var currentLocation = "Pier 48, San Francisco, CA";
    var endLocation = intent.slots.endLocation.value;
    endLocation = endLocation.toLowerCase();
    getFullAddress(endLocation);

    var prefixContent = "The time taken to the destination through current traffic conditions is... ";
    var cardContent = "Route planner";
    var cardTitle = "Plan this route"
    
    getJsonRouteFromMapquest(currentLocation, endpointLocation, function (events) {

                               var repromptText = "Would you like to know the traffic again?"
                                var timeOfArrival = events;
                             console.log(timeOfArrival);
                               if (events.length == 0) {
                               speechText = "There is a problem connecting to MapQuest at this time. Please try again later.";
                               cardContent = speechText;
                               response.tell(speechText);
                               } else {
                               var speechOutput = {
                               speech: "<speak>" + prefixContent + events + " minutes. " + "</speak>",
                               type: AlexaSkill.speechOutputType.SSML
                               };
                               var repromptOutput = {
                               speech: repromptText,
                               type: AlexaSkill.speechOutputType.PLAIN_TEXT
                               };
                               response.askWithCard(speechOutput, repromptOutput, cardTitle, cardContent);
                               }
                               });
}

function getJsonRouteFromMapquest(currentLocation, endLocation, eventCallback) {
    var url = urlRoutePrefix + currentLocation + '&to=' + endLocation;
    console.log(url);
    https.get(url, function(res) {
              var body = '';
              
              res.on('data', function (chunk) {
                     body += chunk;
                     });
              
              res.on('end', function () {
                     var stringResult = parseJsonRoute(body);
                     eventCallback(stringResult);
                     });
              }).on('error', function (e) {
                    console.log("Got error: ", e);
                    });
}



function parseJsonRoute(inputText) {
    //    // sizeOf (/nEvents/n) is 10
    
//    var timeOfArrival = "000";
    var decoder = new StringDecoder('utf8');
    var rawData = decoder.write(inputText);
    var parsedData = JSON.parse(rawData);
    
    var timeOfArrival = parsedData["route"].realTime;
    console.log(timeOfArrival);
    timeOfArrival = Math.ceil(timeOfArrival/60);
    
    return timeOfArrival;
    
}

function handleRemindMeRequest(intent, session, response) {
    
    var prefixContent = "Sending you the E T A and road conditions to your phone now.";
    var cardContent = "Plan this trip";
    var cardTitle = "Trippy trip trip";
    
    var client = require('twilio')(accountSid, authToken);
    
    client.messages.create({
                           to: "+16504318527",
                           from: "+15017250604",
                           body: "This is the ship that made the Kessel Run in fourteen parsecs?",
                           }, function(err, message) { 
                           console.log(message.sid); 
                           });
    
}

function handleTellFriendsRequest(intent, session, response) {
    
    var prefixContent = "Sending an E T A to your friend now. ";
    var cardContent = "Plan this trip";
    var cardTitle = "Trippy trip trip";
    
}



// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the PlanMyTrip Skill.
    var skill = new PlanMyTripSkill();
    skill.execute(event, context);
};

