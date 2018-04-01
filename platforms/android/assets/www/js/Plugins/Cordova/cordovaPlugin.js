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
var cdvSockets = require('./tcp-sockets');

/*************************
 * Plugin Implementation *
 *************************/

var cordovaPlugin = new Promise(function(resolve, reject) {
	document.addEventListener('deviceready', function () {
		var zeroconf = cordova.plugins.zeroconf;
		cordovaPlugin = {

			// Plugin implements same hierarchy as Titanium, (NYI = Not Yet Initialized)
			Platform: { osname: "NYI", address: "NYI" },
			Network:  { READ_WRITE_MODE: "", createTCPSocket: "NYI", createBonjourService: "NYI", createBonjourBrowser: "NYI" },

			init: function() {

				/*************************
			 	* Initialization		 *
			 	*************************/

				// Titanium returns "iphone" instead of "iOS", hence we do the same
				this.Platform.osname = (device.platform === "iOS") ? "iphone" : device.platform.toLowerCase();

				// Network address may change, storing it during initialization is not enough. 
				networkinterface.getIPAddress(function (ip) { 
					/*
					 * JmDNS (Android library) contains some weird bug which does not allow to publish a service
					 * with a name like '192.168.0.0' , replacing '.' by '/' will do the trick.
					 */
					//ip = ip.replace(/\./g, "/");

					// tcp-sockets.js need to know its own ID (hostname), hence we pass it
					cdvSockets.initZeroConf(ip);

					cordovaPlugin.Platform.address = ip;
					resolve(cordovaPlugin);
				});

				/*
				 * Creates a Bonjour service that can publish services on the network.
				 */

				this.Network.createBonjourService = function(args) {
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

				this.Network.createBonjourBrowser = function(args) {
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
				
				this.Network.createTCPSocket = function(args) {
				    var socket = {
				        // "public" fields
				        state: "initialized", // "initialized" || "listening" || "connected" || "closed" || "error"
				        isValid: false,
				        hostName: args.hostName,
				        port: args.port.toString(),

				        // "private" fields
				        channel: null,
				        peerConnection: null,
				        eventEmitter: new EventEmitter(),
				        
				        connect: function() {
				            if(this.state === "initialized")
				            	cdvSockets.connectToPeer(socket);
				        },
						
				        listen: function() {
				            if(this.state === "initialized") {
				            	cdvSockets.listeningSockets.push(socket);
				            	this.state = "listening";
				            }
				        },
				        
				        write: function(str) {
				        	if(this.state === "connected") 
				                this.channel.send(str);
				        },

				        close: function() {
				            if(this.state !== "closed") {
				                this.channel.close();
				                this.peerConnection.close(); // Will trigger an event whose callback will put this socket in state "closed".
				            }
				        },

				        addEventListener: function(name, callback) {
				            this.eventEmitter.addListener(name, callback);
				        },

				        removeEventListener: function(name, callback) {
				            // Multiple listeners can be registered for the same event. The callback parameter is used to determine which listener to remove.
				            this.eventEmitter.removeListener(name, callback);
				        }
				    };

				    return socket;
				};
			}
		};

		cordovaPlugin.init();
	});
});

module.exports.plugin       = cordovaPlugin;
module.exports.EventEmitter = EventEmitter;