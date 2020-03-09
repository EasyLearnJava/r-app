const express = require('express'),
    jsforce = require('jsforce'),
    Configuration = require('./utils/configuration.js'),
    WebSocketService = require('./utils/webSocketService.js');

// Load and check config
require('dotenv').config();
if (!Configuration.isValid()) {
    console.error(
        'Cannot start app: missing mandatory configuration. Check your .env file.'
    );
    process.exit(-1);
}

// Configure and start express
const app = express();
app.use(express.json());

const wss = new WebSocketService();

// Connect to Salesforce
const sfdc = new jsforce.Connection({
    loginUrl: Configuration.getSfLoginUrl(),
    version: '47.0'
});
sfdc.login(
    Configuration.getSfUsername(),
    Configuration.getSfSecuredPassword(),
    error => {
        if (error) {
            console.error('Failed to connect to Salesforce org');
            console.error(error);
            process.exit(-1);
        }
    }
).then(() => {
    console.log('Connected to Salesforce');
    console.log('This : ' + sfdc);
});

app.get('/api/sessions', (req, res) => {
    const soql = `SELECT Id, Name, toLabel(Room__c), Description__c, format(Date_and_Time__c) formattedDateTime,
        (SELECT Speaker__r.Id, Speaker__r.Name, Speaker__r.Description, Speaker__r.Email, Speaker__r.Picture_URL__c FROM Session_Speakers__r)
        FROM Session__c ORDER BY Date_and_Time__c LIMIT 100`;
    /* Salesforce connection */
    sfdc.query(soql, (err, result) => {
        if (err) {
            console.log('Error : ' + err);
            res.sendStatus(500);
        } else if (result.records.length === 0) {
            res.status(404).send('Session not found.');
        } else {
            /* Work with result data */
            const formattedData = result.records.map(sessionRecord => {
                let speakers = [];
                if (sessionRecord.Session_Speakers__r) {
                    speakers = sessionRecord.Session_Speakers__r.records.map(
                        record => {
                            return {
                                id: record.Speaker__r.Id,
                                name: record.Speaker__r.Name,
                                email: record.Speaker__r.Email,
                                bio: record.Speaker__r.Description,
                                pictureUrl: record.Speaker__r.Picture_URL__c
                            };
                        }
                    );
                }
                return {
                    id: sessionRecord.Id,
                    name: sessionRecord.Name,
                    dateTime: sessionRecord.formattedDateTime,
                    room: sessionRecord.Room__c,
                    description: sessionRecord.Description__c,
                    speakers
                };
            });
            res.send({ data: formattedData });
        }
    });
});

// HTTP and WebSocket Listen
const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
wss.connect(server);
