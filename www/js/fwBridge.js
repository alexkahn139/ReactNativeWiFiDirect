/*
 *************************************************************************************************************************************
 * 												   FRAMEWORK BRIDGE 																 *
 * Abstracts from the underlying mobile development framework by providing a framework plugin implementing a well-defined interface. *
 *************************************************************************************************************************************
 *
 * The exports at the bottom of this file happen immediately, hence, at that moment the plugin may not be initialized yet, thus the exported values can't be used.
 * Hence, loading the framework plugin returns a promise that will be resolved once it is initialized. The actual framework plugin is passed as an argument to the callback.
 *
 * We export "cdvOsname" and "cdvAddress" objects below, and update them with the real OS name and ip address once known (upon resolution of the promise).
 * This requires almost no changes to AmbientJS' implementation, except to change every "util.platform" into "util.platform.val", 
 * "util.address" into "util.address.val" and every "util.ambientModule" into "util.ambientModule.module".
 *
 * Note: In order to avoid having "ambient()" function returning a promise, we call "setAmbientModule()" only after the framework plugin is ready.
 */

var setup = {
	"nodejs" 	 		: false,
	"Ti"                : (typeof(Ti) !== 'undefined'),
	"cordova"           : (typeof(cordova) !== 'undefined'),
    "reactnative"       :(typeof(reactnative) !== 'undefined')
};
// Add RN
var promise, events, fwPlugin;
var expPlatform   = { val:"" }; // Exported platform (os name)
var expAddress    = { val:"" };
var ambientModule = { module:"" };

/*
 * Check which framework we are running and load the corresponding framework plugin.
 * To add support for new frameworks, add an else if branch. 
 */

if(setup.Ti)
	var asyncPlugin = require('./Plugins/Titanium/tiPlugin');
else if(setup.cordova)
	var asyncPlugin = require('./Plugins/Cordova/cordovaPlugin');
else if(setup.reactnative)
	var asyncPlugin = require('./Plugins/ReactNative/reactNativePlugin');


// Every framework plugin returns a promise and an event emitter
promise = asyncPlugin.plugin;
events = new asyncPlugin.EventEmitter();

promise.then(function(plugin) {
	// update exported objects with the networking functionality
	fwPlugin = plugin;
	expPlatform.val = plugin.Platform.osname;
	expAddress.val  = plugin.Platform.address;

	setAmbientModule();
	events.emit('AmbientJS-Ready'); // Ensures AmbientJS code is executed AFTER the framework plugin has been initialized
});

/*
 * Returns the read_write_mode code for TCP sockets
 */
function rw_mode(){
	if (setup.Ti)
		return Ti.Network.READ_WRITE_MODE; // Only titanium needs this, hence, we don't need to return an object as it won't be used in the case of cordova
	else
		return "";
}

/*
 * The module for broadcasting functionality and creation of sockets
 */

function ambient(){
	this.createTCPSocket      = fwPlugin.Network.createTCPSocket;
	this.createBonjourService = fwPlugin.Network.createBonjourService;
	this.createBonjourBrowser = fwPlugin.Network.createBonjourBrowser;
}

function ambientNodeJS(){
	var net = require('net');

	this.createServerSocket = net.createServer;
	this.createTCPSocket    = net.Socket;
}

function setAmbientModule() {
	// nodejs is a corner case...
	if(setup.nodejs)
		ambientModule.module = new ambientNodeJS();
	else
		ambientModule.module = new ambient();
}

module.exports.setup		 = setup;
module.exports.events 		 = events;
module.exports.rw_mode       = rw_mode();
module.exports.platform 	 = expPlatform;
module.exports.address  	 = expAddress;
module.exports.ambientModule = ambientModule;