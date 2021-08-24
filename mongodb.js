var MongoClient = require('mongodb').MongoClient;
let _ = require('underscore');
var mongoPassword = "Midkemia01"

var url = "mongodb://localhost:27017/lol";
if (!_.isUndefined(process.env.APP_CONFIG) && !_.isNull(process.env.APP_CONFIG)) {
    var config = JSON.parse(process.env.APP_CONFIG);
    url = "mongodb://" + config.mongo.user + ":" + encodeURIComponent(mongoPassword) + "@" + config.mongo.hostString;

}
module.exports = {
        putRequest: putDataIntoDB,
        getRequest: getDataFromDB,
        closeConnection: closeConnection,
        cbGetRequest: cbGetDataFromDB
    }
    // // Create a new MongoClient
const client = new MongoClient(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

async function getDataFromDB(database, collection, searchObj) {
    if (!client.isConnected()) {
        await client.connect();
    }
    return await client.db(database).collection(collection).findOne(searchObj);
}

async function cbGetDataFromDB(database, collection, searchObj, callback) {
    try {
        if (!client.isConnected()) {
            await client.connect();
        }
        callback(client.db(database).collection(collection).findOne(searchObj));
    } catch (e) {
        console.log(e)
    } finally {
        client.close();
    }
}
// { "id": "patchId" }
async function putDataIntoDB(database, collection, data, selectionCriteria) {
    //Connect the client to the server

    if (!client.isConnected()) {
        await client.connect();
    }
    // Establish and verify connection
    await client.db(database).collection(collection).updateOne(selectionCriteria, { $set: data }, { upsert: true });
}


async function closeConnection() {
    await client.close();
}