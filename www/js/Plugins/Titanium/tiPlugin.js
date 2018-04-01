/*
 * Titanium Framework Plugin
 * Implements "fwPlugin" interface (see thesis).
 */

var EventEmitter = require("./eventemitter");
var tiPlugin = { 
	Platform: { osname: Ti.Platform.osname, address: Ti.Platform.address },
	Network:  { READ_WRITE_MODE: Ti.Network.READ_WRITE_MODE, createTCPSocket: "", createBonjourService: "", createBonjourBrowser: "" } 
};

var promise = new FakePromise(tiPlugin);

if(tiPlugin.Platform.osname === "android") {
	var BonjourAndroid = require('vub.ac.be.nsdmodule');
	tiPlugin.Network.createTCPSocket      = BonjourAndroid.createBonjourSocket;
	tiPlugin.Network.createBonjourService = BonjourAndroid.createBonjourService;
    tiPlugin.Network.createBonjourBrowser = BonjourAndroid.createBonjourBrowser;
}
else {
	tiPlugin.Network.createTCPSocket      = Ti.Network.createTCPSocket;
	tiPlugin.Network.createBonjourService = Ti.Network.createBonjourService;
	tiPlugin.Network.createBonjourBrowser = Ti.Network.createBonjourBrowser;
}


/*
 * Titanium does not contain promises.
 * However Titanium is synchronous, hence when requiring this file "tiPlugin" is ready.
 * Hence, we provide a fake promise function, which upon calling "then" executes the callback and passes tiPlugin as an argument to the callback.
 */

function FakePromise(resolveArg) {
	this.then = function(callback) {
		callback(resolveArg);
	};
}

module.exports.plugin = promise;
module.exports.EventEmitter = EventEmitter;