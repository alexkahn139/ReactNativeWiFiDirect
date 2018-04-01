/*****************************************************************************
 *							CONFIGURATION 									 *
 *****************************************************************************/

var fwBridge = require("./fwBridge");
var config = {
	"nodejs"     : fwBridge.setup.nodejs,
	"serverurl"  : "",
	"serverport" : 40402,
	"clientport" : 40401,
	"encryptionKey" : "A_Secret_Key"
};

/*****************************************************************************/

var encryption = require('./encryption/encryption');

encryption.initializeEncryption(config.encryptionKey);


/* 
 * Encrypt all messages that are sent to the nodejs server
 */

function sendSecure(socket, address, string) {
	if (config.nodejs || address == config.serverurl) {
		string = encryption.encrypt(string);
	}
	
  	console.log("Going to send over socket : " + string);
	socket.write(string);
}

/*
 * Decrypt any incoming message that is encrypted (i.e. coming from the server)
 */

 function decrypt(object) {
 	if (object.encrypted) {
 		var stringifiedObject = encryption.decrypt(object);
 		return JSON.parse(stringifiedObject);
 	}
 	return object;
 }

/* 
 * Retrieve all valid json objects in a string. The method ignores random characters
 * added after the jsons while sending them over the socket (a bugfix for the bonjour
 * library for iOS from Titanium). Will only collect the top-level jsons and does not
 * extract nested json object explicitly.
 * 
 * @Param str: a string containing one or more json objects
 * @Return jsonObjects: an array of json object retrieved from the input string
 */

function retrieveJSON(str){
	var jsonObjects = [];
	var jsonObject = "";
	var nestCtr = 0;
	for (var i=0; i<str.length; i++){
		if (str[i] === '{') nestCtr++;
		if (nestCtr > 0)	jsonObject += str[i];
		if (str[i] === '}') {
			if(nestCtr == 1) {
				try {
					jsonObjects.push(JSON.parse(jsonObject));
					jsonObject = "";
				} catch(e){
					try {
						while (jsonObject.indexOf("\\t")>-1)
								jsonObject = jsonObject.replace("\\t", "\t");
						while (jsonObject.indexOf("\\n")>-1)
							jsonObject = jsonObject.replace("\\n", "\n");
						while (jsonObject.indexOf("\\")>-1)
							jsonObject = jsonObject.replace("\\", '');
						while (jsonObject.indexOf('\\"')>-1)
							jsonObject = jsonObject.replace('\\"', '\"');
						jsonObjects.push(JSON.parse(jsonObject));
						jsonObject = "";
					} catch(e){
						console.log("JSON parse error");
					}
				}
			}
			nestCtr--;
		}
	}
	jsonObjects = jsonObjects.map(function(object){
		return decrypt(object);
	});
	return jsonObjects;
}


/*
 * Returns the platform on which AmbientJS is running, wrapped in an object.
 * In Cordova "val" field of the "cdvOsname" object will be updated once the plugin has been initialized.
 */
function platform(){
 	if (config.nodejs)
 		return {val: "nodejs"};
 	else
 		return fwBridge.platform;
}

/*
 * Returns the address of the device or server, wrapped in an object.
 * For cordova it is updated once the plugin has been initialized.
 */
function address(){
  	if (config.nodejs)
  		return {val: config.serverurl};
  	else
  		return fwBridge.address;
}

/*
 * Returns the port of the device or server
 */
function port(){
 	if (config.nodejs)
   		return config.serverport;
   	else
   		return config.clientport;
}


module.exports.retrieveJSON  = retrieveJSON;
module.exports.sendSecure	 = sendSecure;
module.exports.Ti            = fwBridge.setup.Ti;
module.exports.nodejs 		 = config.nodejs;
module.exports.cordova       = fwBridge.setup.cordova;
module.exports.serverurl	 = config.serverurl;
module.exports.serverport	 = config.serverport;
module.exports.platform		 = platform();
module.exports.address		 = address();
module.exports.port			 = port();
module.exports.rw_mode 		 = fwBridge.rw_mode; //rw_mode();
module.exports.ambientModule = fwBridge.ambientModule;
module.exports.events        = fwBridge.events;