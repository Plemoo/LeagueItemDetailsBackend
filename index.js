// load the things we need
let _ = require('underscore');
let express = require('express');
let mongodb = require("./mongodb.js")
var cors = require('cors')
var serveStatic = require('serve-static');

// use res.render to load up an ejs view file
let app = express();
//app.use(cors())
app.use(serveStatic(__dirname + "/frontend"));


/********************************** MIDDLEWARE END ***********************/

/********************************** BACKEND SERVER ***********************/

// Standard/Initial Case, when user 
app.get('/api/itemsByCategory', async(req, res, next) => {
    try {
        let patch = req.query.patch;
        if (_.isUndefined(patch) || _.isNull(patch)) {
            const items = await getItemsByCategoryFromLatestPatch();
            res.json(items)
        } else {
            const items = await getItemsByCategoryOfPatch(patch);
            res.json(items)
        }
        next();
    } catch (err) {
        console.log(err);
        next(err);
    }
})


app.get('/api/keys', (req, res) => {
    res.json(keyArray);
})

app.get('/api/getPatches', (req, res) => {
    getFilteredPatches().then((patchArray) => {
        res.json(patchArray);
    })
});

var port = 3080;
if (!_.isUndefined(process.env.PORT) && !_.isNull(process.env.PORT)) {
    port = process.env.PORT
}
app.listen(port);
console.log("Listening on Port " + port)


/********************************** BACKEND SERVER END ***********************/

// let urlPatches = "http://ddragon.leagueoflegends.com/api/versions.json";
//let urlItems = "http://ddragon.leagueoflegends.com/cdn/" + patch + "/data/en_US/item.json";
//let urlItemImg = "http://ddragon.leagueoflegends.com/cdn/" + patch + "/img/item/"
let https = require('https');
const { Double } = require('bson');
let keyArray = []; // contains all the keys like AttackDamage, etc
//let sortedData = "test";
const patchDb = "patch"
let mongoDbColl = "lol";
if (!_.isUndefined(process.env.APP_CONFIG) && !_.isNull(process.env.APP_CONFIG)) {
    mongoDbColl = JSON.parse(process.env.APP_CONFIG).mongo.db;

}


const patchId = "patchId";
const itemCategoryDb = "itemsByCategory";

async function pushPatchesIntoDb() {
    const patchesFromAPI = await getPatchesFromAPI();
    const allPatches = await getAllPatches();
    if (_.difference(patchesFromAPI.slice(0, 50), allPatches.patches).length != 0) {
        mongodb.putRequest(mongoDbColl, patchDb, { id: patchId, patches: patchesFromAPI.slice(0, 50) }, { id: patchId });
    }
}




/**
 * Used in getPatches Request to only get the Patches starting with 11
 * @returns Patch Array starting with 11
 */
async function getFilteredPatches() {
    pushPatchesIntoDb();
    const patches = await getAllPatches();
    let filteredPatches = _.filter(patches, (patch) => {
        return patch.startsWith("11");
    });
    return filteredPatches;
}

/**
 * helper function to get all Patches from DB, if they are not found, get Patches from API
 * @returns 
 */
async function getAllPatches() {
    const patchArray = await mongodb.getRequest(mongoDbColl, patchDb, { id: patchId });
    if (patchArray == null) {
        const apiPatches = await getPatchesFromAPI();
        return apiPatches;
    } else {
        return patchArray.patches;
    }
}

async function getPatchesFromAPI() {
    let urlPatches = "https://ddragon.leagueoflegends.com/api/versions.json";
    return new Promise((resolve, reject) => {
        let patchData = "";
        https.get(urlPatches, resp => {
            resp.on('data', (chunk) => {
                patchData += chunk;
            });
            resp.on('end', () => {
                resolve(JSON.parse(patchData));
                //json = json.filter(filterPatches)
            });
        }).on("error", err => {
            reject(err);
        })
    })
}

/**
 * Used in the Backend Server get Request, to extract tha Items of the latest Patch
 * @returns Items by Category of the Latest Patch
 */
async function getItemsByCategoryFromLatestPatch() {
    const allPatches = await getAllPatches();
    return getItemsByCategoryOfPatch(allPatches[0]);
}

/**
 * Strarting Point in Middleware, when the User requests the Items from a specific Patch
 * @param {*} lolPatch String containing the Patch for which the data should be returned
 * @returns items by category, if they are not stored in the Database, they are retrieved from the API
 */
async function getItemsByCategoryOfPatch(lolPatch) {
    const dbItems = await mongodb.getRequest(mongoDbColl, itemCategoryDb, { patch: lolPatch });
    if (_.isNull(dbItems) || _.isUndefined(dbItems)) {
        const apiItems = await getItemsByCategory(lolPatch);
        if (!_.isEmpty(apiItems)) {
            mongodb.putRequest(mongoDbColl, itemCategoryDb, { patch: lolPatch, items: apiItems }, { patch: lolPatch });
        }
        return apiItems;
    } else {
        return dbItems.items;
    }
}



function getItemsByCategory(patch) {
    let urlItems = "https://ddragon.leagueoflegends.com/cdn/" + patch + "/data/en_US/item.json";
    return new Promise((resolve, reject) => {
        https.get(urlItems, (resp) => {
            let data = ""
                // A chunk of data has been received.
            resp.on('data', (chunk) => {
                data += chunk;
            });
            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                let json = JSON.parse(data);
                let itemArray = createItemArray(json, patch);
                if (patch.startsWith("11")) {
                    itemArray = analysePassive(itemArray);
                }
                let filteredArray = structureItemArrayByCategory(itemArray);
                let sortedArray = sortArray(filteredArray);
                sortedArray = removeTenacityColumn(sortedArray)
                sortedArray = changeRingAndTomePosition(sortedArray);
                var coefficient = getBaseValItems(sortedArray);
                let sortedData = sortedArray;
                sortedData = addCoefficientToItemArray(sortedArray, coefficient);
                resolve(sortedData);
            }).setEncoding('utf8');
        }).on("error", (err) => {
            reject(err)
            console.log("Error: " + err.message);
        });
    })
}


function changeRingAndTomePosition(filteredAndSortedItems) {
    var ampliTome = "";
    keyArray.forEach(key => {
        for (let index = 0; index < filteredAndSortedItems[key].length; index++) {
            if (filteredAndSortedItems[key][index].itemName == "Amplifying Tome") {
                ampliTome = filteredAndSortedItems[key][index];
                //filteredAndSortedItems[key].unshift(filteredAndSortedItems[key][index])
            }
        }
        if (filteredAndSortedItems[key].indexOf(ampliTome) != -1) {
            filteredAndSortedItems[key].splice(filteredAndSortedItems[key].indexOf(ampliTome), 1);
            filteredAndSortedItems[key].unshift(ampliTome);
        }
    });
    return filteredAndSortedItems;
}

/**
 * tenacity items cannot really be sorted, since the effect is mainly just temporery
 * @param {*} filteredAndSortedItems 
 */
function removeTenacityColumn(filteredAndSortedItems) {
    var keyValue = "Tenacity";
    keyArray.forEach(key => {
        for (let index = 0; index < filteredAndSortedItems[key].length; index++) {

            var keys = _.keys(filteredAndSortedItems[key][index].itemStats);
            if (keys.includes(keyValue)) {
                delete filteredAndSortedItems[key][index].itemStats[keyValue];
                for (let index1 = 0; index1 < filteredAndSortedItems[key][index].statsArr.length; index1++) {
                    if (_.keys(filteredAndSortedItems[key][index].statsArr[index1]).includes(keyValue)) {
                        filteredAndSortedItems[key][index].statsArr.splice(index1, 1);
                    }

                }

            }
        }
        if (key == keyValue) {
            delete filteredAndSortedItems[key];
        }
    })
    if (keyArray.indexOf(keyValue) != -1) {
        keyArray.splice(keyArray.indexOf(keyValue), 1)
    }

    return filteredAndSortedItems;
}

function getItemByLowestGold(itemArray) {
    var tmp;
    var lowest = Number.POSITIVE_INFINITY
    var lowestItem = null;
    itemArray.forEach((item => {
        tmp = item.itemGold;
        if (tmp < lowest) {
            lowest = tmp;
            lowestItem = item;
        }
    }))
    return lowestItem;
}

function getItemsWithOnlyOneAttr(itemArray) {
    var itemsWithOnlyOneAttr = [];
    itemArray.forEach((item) => {
        if (_.keys(item.itemStats).length == 1) {
            itemsWithOnlyOneAttr.push(item)
        }
    })
    return itemsWithOnlyOneAttr;
}

function itemsWithOneAttrLeft(itemArray, coefficientObj) {
    var onlyOneAttr = getItemsWithOnlyOneAttr(itemArray);
    if (onlyOneAttr.length != 0) {
        return onlyOneAttr;
    }
    var itemsWithOnlyOneAttr = [];
    var alreadyCalculatedKeys = _.keys(coefficientObj);
    itemArray.forEach((item) => {
        let itemKeys = _.keys(item.itemStats);
        let keysNotYetIncludedInCoefficient = _.filter(itemKeys, (keyOfItem) => !alreadyCalculatedKeys.includes(keyOfItem));
        if (keysNotYetIncludedInCoefficient.length == 1) {
            itemsWithOnlyOneAttr.push(item);
        }
    });
    return itemsWithOnlyOneAttr;
}

/**
 * Hier wird für jede Categorie der Coefficient berechnet. Dabei wird immer das erste Item der Liste genommen, da das als Grundwert angenommen wird und dann dessen Gold durch dessen Category Wert geteilt
 * @param {*} filteredAndSortedItems JSON Object containing all the Items sorted after the Category
 * @returns ein coefficient Object, das für jeden Categoriepunkt dessen Goldwert entspricht (z.B. 1 health entspricht 0.5 Gold)
 */
function getBaseValItems(filteredAndSortedItems) {
    var counter = 0;
    var coefficientObj = new Object();
    var wrongCalculatedKeys = [];
    // Coefficient wenn für das Attribut ein Item mit nur einem Wert gefunden wird (keine Weiteren Attribute. Z.B. Ruby Cristal, nur Health)
    var missingKeys = [];
    do {
        keyArray.forEach(key => {
            //let itemsWithOnlyOneAttr = getItemsWithOnlyOneAttr(filteredAndSortedItems[key]);
            let itemsWithOnlyOneAttr = itemsWithOneAttrLeft(filteredAndSortedItems[key], coefficientObj); // find Items which have only one Attribute or only one Attribute where the coefficient was not yet calculated for
            if (itemsWithOnlyOneAttr.length != 0) {
                let itemWithLowestGold = getItemByLowestGold(itemsWithOnlyOneAttr);
                if (itemWithLowestGold != null) {
                    var itemKeyArr = _.keys(itemWithLowestGold.itemStats);
                    var itemValuAcc = 0; // Value of already calculated Attributes, if Item has more than one Attr
                    itemKeyArr.forEach(itemKey => {
                        if (key != itemKey) {
                            itemValuAcc += coefficientObj[itemKey] * parseInt(itemWithLowestGold.itemStats[itemKey]);
                        }
                    });
                    var valueOfItem = parseInt(itemWithLowestGold.itemStats[key]);
                    var goldOfItem = parseInt(itemWithLowestGold.itemGold)
                    var keyCoefficient = (goldOfItem - itemValuAcc) / valueOfItem; // wieviel kostet 1 Attributwert an Gold (subtract the already known coefficient)
                    if (keyCoefficient < 0) {
                        wrongCalculatedKeys.push(key);
                    }
                    coefficientObj[key] = keyCoefficient;
                    if (missingKeys.includes(key)) {
                        missingKeys.splice(missingKeys.indexOf(key), 1);
                    }
                } else {
                    missingKeys.push(key);
                }
            } else { // items with more than one Attr
                missingKeys.push(key);
            }
        });
        counter++;
    } while (counter < 100 && missingKeys.length == 0)

    wrongCalculatedKeys.forEach(key => {
        if (filteredAndSortedItems[key].length > 1) {
            var itemKeyArr = _.keys(filteredAndSortedItems[key][1].itemStats);
            var itemValuAcc = 0; // Value of already calculated Attributes, if Item has more than one Attr
            itemKeyArr.forEach(itemKey => {
                if (key != itemKey) {
                    itemValuAcc += coefficientObj[itemKey] * parseInt(filteredAndSortedItems[key][1].itemStats[itemKey]);
                }
            });
            var valueOfItem = parseInt(filteredAndSortedItems[key][1].itemStats[key]);
            var goldOfItem = parseInt(filteredAndSortedItems[key][1].itemGold)
            var keyCoefficient = (goldOfItem - itemValuAcc) / valueOfItem; // wieviel kostet 1 Attributwert an Gold (subtract the already known coefficient)
            coefficientObj[key] = keyCoefficient;
        }
    });

    return coefficientObj;
}

/**
 * 
 * @param {array containing all items} allItems 
 * returns a filtered array of items, filtered after the attribute:
 * filteredItems:{stat1:[item1,item2], stat2:[item1,item9]}
 */
function structureItemArrayByCategory(allItems) {
    let filteredItems = new Object();
    keyArray.forEach(attr => {
        if (!Object.keys(filteredItems).includes(attr)) {
            filteredItems[attr] = [];
        }
        allItems.forEach(item => {
            item["statsArr"].forEach(stat => {
                if (attr == Object.keys(stat)) {
                    filteredItems[attr].push(item);
                }
            })
        })
    })
    return filteredItems;
}

/**
 * 
 * @param {*} filteredItems 
 * array sorted by lowest gold
 */
function sortArray(filteredItems) {
    keyArray.forEach(attr => {
        filteredItems[attr].sort((item1, item2) => {
            return item1["itemGold"] - item2["itemGold"];
        });
    })
    return filteredItems;
}

/**
 * 
 * @param {Array containing the Categories where the Items are stored as JSON Objects} sortedArray 
 * @param {JSON Coefficient Object, stores the Category and its gold Value} coefficient 
 * @returns input Array with additional 
 */
function addCoefficientToItemArray(sortedArray, coefficient) {
    keyArray.forEach(key => {
        for (let index = 0; index < sortedArray[key].length; index++) {
            var itemGold = sortedArray[key][index].itemGold;
            var itemKeys = Object.keys(sortedArray[key][index].itemStats);
            var itemGoldValCoeficcient = 0
            itemKeys.forEach(itemKey => {
                var itemAttrValue = parseInt(sortedArray[key][index].itemStats[itemKey]);
                var attrGold = itemAttrValue * coefficient[itemKey]; // attribute value of Item multiplied with how much 1 Attr value costs
                itemGoldValCoeficcient += attrGold;
            })
            sortedArray[key][index]["itemValue"] = Math.round(itemGoldValCoeficcient);
            sortedArray[key][index]["itemCoefficient"] = Math.round(100 * itemGoldValCoeficcient / itemGold); // Dreisatz
        }
    })
    return sortedArray;
}

/**
 * 
 * itemName
 * itemGold
 * itemImage
 * passiveString
 * statsArr
 * itemStats (this should be used to retrieve items)
 * Returns an Array containing item objects
 * newJson:[{itemName: xx, itemStats:[stat1:12, stat2:1]},..]
 */
function createItemArray(jsonData, patch) {
    let urlItemImg = "https://ddragon.leagueoflegends.com/cdn/" + patch + "/img/item/"
    let newJson = [];
    let itemKeysArray = Object.keys(jsonData.data);
    itemKeysArray.forEach(element => {
        // filter out items which are not in ranked but in other games like aram etc
        let isPurchasable = jsonData.data[element].gold.purchasable;
        var bool1 = jsonData.data[element].maps["11"];
        var bool2 = jsonData.data[element].maps["12"];
        var bool3 = jsonData.data[element].maps["21"];
        var bool4 = jsonData.data[element].maps["22"];
        var isInStore = _.isUndefined(jsonData.data[element].inStore) ? true : false;
        var isHidden = _.isUndefined(jsonData.data[element].hideFromAll) ? false : true;
        var isConsumable = _.isUndefined(jsonData.data[element].consumed) ? false : true;
        if (_.isUndefined(bool3)) {
            bool3 = true;
        }
        var isHowlingAbyssItem = jsonData.data[element].name.includes("Guardian's");
        var isGoldenSpactula = jsonData.data[element].name.includes("Golden Spatula");
        var elixir = jsonData.data[element].name.includes("Elixir");
        var corruptingPotion = jsonData.data[element].name.includes("Corrupting Potion");
        var orrnItem = jsonData.data[element].name.includes("ornnIcon");
        var orrnItem1 = jsonData.data[element].requiredAlly;
        if (!elixir && !orrnItem && orrnItem1 != "Ornn" && !corruptingPotion && !isHowlingAbyssItem && !isGoldenSpactula) {
            let item = null;
            if (isPurchasable && bool1 && bool2 && bool3 && !bool4) {
                item = getItem(jsonData, element, urlItemImg);
            } else if (bool1 && !bool2 && !bool3 && !bool4 && isPurchasable) {
                item = getItem(jsonData, element, urlItemImg);
            } else if ((!bool1 && !bool2 && !bool3 && !bool4) && isInStore && !isHidden && !isConsumable) {
                item = getItem(jsonData, element, urlItemImg);
            }
            if (item != null) {
                newJson.push(item);
            }
        }
    });
    return newJson;
}


function getItem(jsonData, element, urlItemImg) {
    let item = new Object();
    let itemName = jsonData.data[element].name;
    let itemGold = jsonData.data[element].gold.total;
    let itemImage = urlItemImg + jsonData.data[element].image.full;
    let descriptionString = jsonData.data[element].description;
    let startStat = descriptionString.indexOf("<stats>");
    let endStat = descriptionString.indexOf("</stats>");

    let statsString = descriptionString.substring(startStat + 7, endStat);
    let passiveString = descriptionString.substr(endStat + 8);
    passiveString = passiveString.replace(/(<([^>]+)>)/gi, "");
    statsString = statsString.replace("<stats>", "");
    statsString = statsString.replace("</stats>", "");
    statsString = statsString.replace(/<\/attention>/g, "");
    statsString = statsString.replace(/<\/br>/g, "");
    statsString = statsString.replace(/<br>/g, "");
    let itemStats = new Object();
    statsString = statsString.replace(/ /g, "");
    statsArr = statsString.split("<attention>"); // Array containing the Attributes with the keys of the item
    // statsArr = statsString.split("<attention> ");
    //statsArr = statsArr.filter(item => item);

    for (let index = 0; index < statsArr.length; index++) {
        if (statsArr[index].includes("MoveSpeed") && statsArr[index].includes("%")) {
            statsArr[index] = statsArr[index].replace("MoveSpeed", "PercentMoveSpeed")
        }
        statsArr[index] = statsArr[index].replace(/%/g, "");
        let number = statsArr[index].match(/[0-9]+/g);
        let key = statsArr[index].replace(number, "");
        if (key.match("^[a-zA-Z]+$")) { // only accept the key if it only contains letters
            itemStats[key] = number;
            if (!keyArray.includes(key)) {
                keyArray.push(key);
            }
            let obj = new Object();
            obj[key] = number;
            statsArr[index] = obj;
        }
    }
    item["statsArr"] = statsArr;
    item["itemStats"] = itemStats;
    item["passiveString"] = passiveString;
    item["itemName"] = itemName;
    item["itemGold"] = itemGold;
    item["itemImage"] = itemImage;
    if (!_.isNull(statsArr) && !_.isNull(itemStats) && !_.isNull(itemName) && !_.isNull(itemGold) && !_.isNull(itemImage)) {
        return item;
        //newJson.push(item);
    } else {
        return null;
    }
}

/**
 * Analyzes the passive String of the Item to extract the Item Values
 * @param {*} newJson 
 * @returns 
 */
function analysePassive(newJson) {
    // spezeille Reihenfolge damit zuerste "ArmorPen" vor "Armor" erkannt wird
    var sortedKeyArray = _.sortBy(keyArray, (key) => {
        return key.length;
    }).reverse();
    for (let index = 0; index < newJson.length; index++) {
        for (let keyIndex = 0; keyIndex < sortedKeyArray.length; keyIndex++) {
            // remove whitespaces of passive string
            var trimmedPassiveString = newJson[index].passiveString.replace(/ /g, '')
            if (trimmedPassiveString.indexOf("MoveSpeed") >= 0 && trimmedPassiveString.charAt(trimmedPassiveString.indexOf("MoveSpeed") - 1) == ("%")) {
                trimmedPassiveString = trimmedPassiveString.replace("MoveSpeed", "PercentMoveSpeed");
            }
            trimmedPassiveString = trimmedPassiveString.replace(/%/g, "");
            var skip = false;
            // skip to stop overwriting the values (Skip items who already have this key)
            if (newJson[index].itemStats.hasOwnProperty(sortedKeyArray[keyIndex])) {
                skip = true;
            }

            // REMOVES FOUND ENTRIES WHICH ARE NOT REAL ATTRIBUTES (like regenerations or temporary buffs)
            var stringOccurence = trimmedPassiveString.search(sortedKeyArray[keyIndex]);
            var isTest = true;
            var i = 1;
            // avoid counting Armor Penetration as Armor
            if (sortedKeyArray[keyIndex] == "Armor" && "Penetration" == trimmedPassiveString.substring(stringOccurence + 5, stringOccurence + 16)) {
                skip = true;
            }
            while (isTest) {
                var char = trimmedPassiveString.charAt(stringOccurence - i);
                if (!(!isNaN(char) || char == " ")) { // char is number or space
                    isTest = false;
                    var wronglyClassified = trimmedPassiveString.substring(stringOccurence - i - 7, stringOccurence - i + 1);
                    if (wronglyClassified.includes("below") || wronglyClassified.includes("restore") || wronglyClassified.includes("-") || wronglyClassified.includes("dealing")) {
                        skip = true;
                    }

                }
                if (i > 7) { // random number just to make sure that it is not a endless loop
                    isTest = false;
                }
                i++;
            }
            var gainString = trimmedPassiveString.substring(stringOccurence - 5, stringOccurence - 1);
            if (sortedKeyArray[keyIndex].includes("MoveSpeed") && (!(gainString == "Gain")) && (stringOccurence - 3) >= 0) {
                skip = true;
            }


            if (stringOccurence != -1 && !skip) {
                // char At -1 ist zahl
                var number1 = trimmedPassiveString.charAt(stringOccurence - 1);
                var newObj = new Object();
                if (!isNaN(number1) && number1 != " ") {
                    var number2 = trimmedPassiveString.charAt(stringOccurence - 2);
                    if ((!isNaN(number2) && number2 != " ") || number2 == ".") { // falls eine Komma Zahl
                        var number3 = trimmedPassiveString.charAt(stringOccurence - 3);
                        if (!isNaN(number3) && number3 != " ") {
                            newObj[sortedKeyArray[keyIndex]] = [number3 + "" + number2 + "" + number1];
                            newJson[index].statsArr.push(newObj);
                            newJson[index].itemStats[sortedKeyArray[keyIndex]] = [number3 + "" + number2 + "" + number1];
                        } else {
                            newObj[sortedKeyArray[keyIndex]] = [number2 + "" + number1];
                            newJson[index].statsArr.push(newObj);
                            newJson[index].itemStats[sortedKeyArray[keyIndex]] = [number2 + "" + number1];
                        }

                    } else {
                        newJson[index].itemStats[sortedKeyArray[keyIndex]] = [number1];

                        newObj[sortedKeyArray[keyIndex]] = [number1];
                        newJson[index].statsArr.push(newObj);
                    }

                }
            }
        }
    }
    return newJson;
}


// { itemName: 'Faerie Charm',
//   itemGold: 250,
//   itemImage:
//    'http://ddragon.leagueoflegends.com/cdn/11.1.1/img/item/1004.png',
//   passiveString: '',
//   statsArr: [ { BaseManaRegen: [Array] } ],
//   itemStats: { BaseManaRegen: [ '50' ] } }