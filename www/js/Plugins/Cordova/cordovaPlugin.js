/**************************************************************************************************
 * Cordova Plugin for AmbientJS by Kevin De Porre 												  *
 * 																								  *
 * Following plugins need to be installed : 													  *
 *   - Device 																					  *
 *   - iosrtc 																					  *
 *   - ZeroConf 																				  *
 *   - Crosswalk --> Optional but great for portability with older Android devices				  *
 *   - networkinterface																			  *
 *   - Eventemitter --> "npm install wolfy87-eventemitter --save"                                 *
 *																								  *
 * Usage :                                                                                        *
 *   - Require this plugin, e.g. "var cdvPlugin = require('./cordovaPlugin').plugin;"             *
 *   - Use plugin once initialized --> cdvPlugin.then(function(plugin) { ... });                  *
 **************************************************************************************************/

var EventEmitter = require('wolfy87-eventemitter');
var Sockets = require('./Sockets/socket');


var cordovaPlugin = new Promise(function(resolve, reject) {
	document.addEventListener('deviceready', function () {
		var zeroconf = cordova.plugins.zeroconf;

		// Plugin implements same hierarchy as Titanium
		cordovaPlugin = { 
			Platform: new Platform(resolve),
			Network:  new Network(zeroconf)
		};
	});
});


/*
 * Creates a Platform object containing information about the device.
 * Fields : "osname", "address"
 * Arguments : function to resolve the promise
 */

function Platform(resolve) {
	/*
	 * Make an "osname" field.
	 *
	 * Titanium mentions "iphone" instead of "iOS", hence we do the same
	 */
	this.osname = (device.platform === "iOS") ? "iphone" : device.platform.toLowerCase();
	var that = this; // Such that this scope can be accessed from within the callback below, to add an "address" field

	/*
	 * Make an "address" field.
	 *
	 * Network address may change, storing it during initialization is not enough, however, AmbientJS assumes that the network address does not change...
	 */
	networkinterface.getIPAddress(function (ip) { 

		// tcp-sockets.js need to know its own ID (hostname), hence we pass it
		Sockets.initZeroConf(ip);

		that.address = ip;
		-resolve(cordovaPlugin);
	});
}


/*
 * Creates a Network object containing zero-configuration networking functionality.
 * Fields : "READ_WRITE_MODE" , "createTCPSocket" , "createBonjourService" , "createBonjourBrowser"
 * Arguments : none
 */

function Network(zeroconf) {
	this.READ_WRITE_MODE = "";


	/*
	 * Creates a Bonjour service that can publish services on the network.
	 */

	this.createBonjourService = function(args) {
		var serviceObject = {
			name:  args.name,
			type:  args.type,
			domain: args.domain,

			fulltype: args.type + '.' + args.domain, // e.g. '_ambient._tcp.local.'

			publish: function(socket) {
				/* 
				 * All field values need to be strings in order to be published successfully.
				 * Instead of stringify'ing all fields that are not yet strings, we will just send the hostname and port.
				 * On receiving this "simplified socket" we will make a connecting socket to that hostname and port. 
				 */

				var simplifiedSocket = { 'hostName': socket.hostName, 'port': socket.port };
				zeroconf.register(this.fulltype, this.name, 80, simplifiedSocket);
			}
		};

		return serviceObject;
	};


	/*
	 * Creates a browser to discover services published on the network.
	 */

	this.createBonjourBrowser = function(args) {
		var browserObj = {
			type:     args.serviceType,
			domain:   args.domain,
			fulltype: args.serviceType + '.' + args.domain,
			eventEmitter: new EventEmitter(), // Browser needs its own event handler in order not to interfere with other service browsers.

			search: function() {
				var evntEmitter = this.eventEmitter;
				zeroconf.watch(this.fulltype, function(result) {
				    var action  = result.action;
				    var service = result.service;
				    var name    = service.name;

				    // Create a copy of the socket he wanted to send us
				    var socket;
				    var simplifiedSocket  = service.txtRecord;

				    if(name !== cordovaPlugin.Platform.address) {
				    	// We discovered an actor and his simplified socket.
				    	// --> make a socket that will connect with him ONLY IF the actor we found is not ourself, else we would overwrite our own socket !!
			    	    socket = cordovaPlugin.Network.createTCPSocket({
			    	    	hostName: simplifiedSocket.hostName,
			    			port: simplifiedSocket.port,
			    	    });
			    	}

		    	    // Service we return to the user must contain the service name and the published socket
		    	    var discoveredService = { 'name': name, 'socket': null, resolve: function() {
		    	    	this.socket = socket;
		    	    }};

		    	    if (action == 'added') {
		    	        // Trigger 'updatedServices' event on discovery of new services
		    	        evntEmitter.emit('updatedServices', { 'services': [ discoveredService ] });
		    	    }
				});
			},

			addEventListener: function(name, callback) {
				this.eventEmitter.addListener(name, callback);
			}
		};

		return browserObj;
	};


	/*
	 * Creates a TCP socket using WebRTC's DataChannel as underlying technology.
	 */
	
	this.createTCPSocket = function(args) {
		return new Sockets.Socket(args);
	};
}

module.exports.plugin = cordovaPlugin;
module.exports.EventEmitter = EventEmitter;