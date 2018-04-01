/*****************************************************************************
 *							CONFIGURATION 									 *
 *****************************************************************************/

/*
 * Ugly things to make it run in Cordova (with as few changes as possible to AmbientJS) happen below..
 *
 * The exports at the bottom of this file happen immediately, hence, at that moment the cordova plugin is not yet initialized and the exported values can't be used.
 * Hence, we have to use promises that will be resolved once the cordova plugin is initialized. 
 *
 * Requiring the cordova plugin returns a promise that gets resolved once it has been initialized.
 * We export "cdvOsname" and "cdvAddress" objects below, and update them with the real OS name and ip address once known (upon resolution of the promise).
 *
 * This requires almost no changes to AmbientJS' implementation, except to change every "util.platform" into "util.platform.val", 
 * "util.address" into "util.address.val" and every "util.ambientModule" into "util.ambientModule.module"
 *
 * Note: In order to avoid having "ambientIphone()" and "ambientAndroid()" functions returning promises, we assign the cordova plugin to "fwPlugin" once it is resolved.
 *       Hence, we may rely on the fact that those functions will always use fwPlugin after it has been assigned the plugin. This holds because the programmer
 *       writes his AmbientJS code inside a callback that is executed AFTER AmbientJS is ready (and hence also the cordova plugin is ready).
 */

var config = {
	"nodejs" 	 : false,
	"Ti"         : (typeof(Ti) !== 'undefined'),
	"cordova"    : (typeof(cordova) !== 'undefined'),
	"serverurl"  : "",
	"serverport" : 40402,
	"clientport" : 40401,
	"encryptionKey" : "A_Secret_Key"
};

var fwPlugin, promise, events;
var expPlatform      = { val:"NYI" }; // Exported platform (os name)
var expAddress       = { val:"NYI" };
var ambientModule    = { module:"NYI" };

/*
 * Check which framework we are running and do some setup work.
 * TO SUPPORT NEW FRAMEWORKS : Add an else if branch, no further changes required to AmbientJS if plugin is implemented the right way :)
 * If plugin is synchronous assign it to fwPlugin, else asign the returned promise to "promise" and assign the event EventEmitter object to "events" (will be used to trigger AmbientJS ready event)
 * For each framework, assign boolean value to config.pluginSynchronous to indicate whether or not the plugin is synchronous.
 */

if(config.Ti) {
	fwPlugin = Ti;
	config.pluginSynchronous = true;
}
else if(config.cordova) {
	asyncPlugin = require('./Plugins/Cordova/cordovaPlugin');
	promise = asyncPlugin.plugin; // Asynchronous plugin returning a promise
	events = new asyncPlugin.EventEmitter();
	config.pluginSynchronous = false;
}

/*
 * Do setup work based on the kind of framework plugin (synchronous vs asynchronous).
 * For synchronous plugins we can immediately update the objects that will be exported with their value, as they are known.
 * For asynchronous plugins, update the exported objects once the value is known (hence once the plugin gets resolved).
 */

if(config.pluginSynchronous) {
	expPlatform.val = fwPlugin.Platform.osname;
	expAddress.val = fwPlugin.Platform.address;
	setAmbientModule();
}
else {
	// Asynchronous plugin, promise gets resolved when plugin is ready, the plugin is passed as an argument to the callback.
	promise.then(function(plugin) {
		// "expPlatform" and "expAddress" have been exported. Parts using those exported objects will see the updates (only because it are objects and not simple values!).
		fwPlugin        = plugin;
		expPlatform.val = plugin.Platform.osname;
		expAddress.val  = plugin.Platform.address;

		setAmbientModule();
		events.emit('AmbientJS-Ready'); // Ensures AmbientJS code is executed after Cordova plugin has been initialized
	});
}

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
 		return expPlatform;
}

/*
 * Returns the address of the device or server, wrapped in an object.
 * For cordova it is updated once the plugin has been initialized.
 */
function address(){
  	if (config.nodejs)
  		return {val: config.serverurl};
  	else
  		return expAddress;
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

/*
 * Returns the read_write_mode code for TCP sockets
 */
function rw_mode(){
	if (config.Ti)
		return Ti.Network.READ_WRITE_MODE; // Because Titanium sockets require a constant indicating the read-write mode. Not needed for Cordova or nodejs.
	else
		return "";
}


/*
 * The module for broadcasting functionality and creation of sockets
 */

function ambientIphone(){
	this.createTCPSocket      = fwPlugin.Network.createTCPSocket;
	this.createBonjourService = fwPlugin.Network.createBonjourService;
	this.createBonjourBrowser = fwPlugin.Network.createBonjourBrowser;
}

function ambientAndroid(){
	var BonjourAndroid;

	// Need to check if running in Titanium because the author of the nsdmodule plugin for Titanium used the name "createBonjourSocket" instead of the copying Titanium's name (createTCPSocket)
	if(config.Ti) {
		BonjourAndroid            = require('vub.ac.be.nsdmodule');
		this.createTCPSocket      = BonjourAndroid.createBonjourSocket;
		this.createBonjourService = BonjourAndroid.createBonjourService;
		this.createBonjourBrowser = BonjourAndroid.createBonjourBrowser;
	} 
	else {
		this.createTCPSocket      = fwPlugin.Network.createTCPSocket;
		this.createBonjourService = fwPlugin.Network.createBonjourService;
		this.createBonjourBrowser = fwPlugin.Network.createBonjourBrowser;
	}
}

function ambientNodeJS(){
	var net = require('net');

	this.createServerSocket = net.createServer;
	this.createTCPSocket    = net.Socket;
}

function setAmbientModule() {
	switch(platform().val) {
		case "android": ambientModule.module = new ambientAndroid();
						break;
		case "iphone":
		case "ipad": 	ambientModule.module = new ambientIphone();
						break;
		case "nodejs":  ambientModule.module = new ambientNodeJS();
						break;
		default: 		console.log("[ERROR] Unsupported platform");
	}
}


module.exports.retrieveJSON  = retrieveJSON;
module.exports.sendSecure	 = sendSecure;
module.exports.Ti            = config.Ti;
module.exports.nodejs 		 = config.nodejs;
module.exports.cordova       = config.cordova;
module.exports.serverurl	 = config.serverurl;
module.exports.serverport	 = config.serverport;
module.exports.platform		 = platform();
module.exports.address		 = address();
module.exports.port			 = port();
module.exports.rw_mode 		 = rw_mode();
module.exports.ambientModule = ambientModule;
module.exports.events        = events;