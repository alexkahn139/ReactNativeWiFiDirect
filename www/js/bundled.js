(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Receptionist 	  = require('./receptionist').Receptionist;
var cm 				  = require('./connectionManager');
var ConnectionManager = cm.ConnectionManager;
var DiscoveryManager  = require('./discoveryManager').DiscoveryManager;

var connectionManager = new ConnectionManager();
var discoveryManager  = new DiscoveryManager(connectionManager);
var receptionist      = new Receptionist(connectionManager);

// Online will initialize the connectionmanager, make the client discoverable
// for other clients and start the discovery of remote clients.
function online() {
	connectionManager.start(receptionist);
	discoveryManager.goOnline();
};

/* CreateObject creates a new object that can be shared over a network. This
 * object can be discovered over the network by other clients. Whenever the
 * object is discovered, a reference pointing to the object is provided to
 * the other client. This reference can be used to send messages to the
 * remote object.
 * 
 * @Param object: a json object with all methods of the object
 * @Param proxy:  optional argument containing a proxy, changing the behaviour
 * 				  of the reference
 */
function createObject(object, proxy) {
	var reference = receptionist.createObject(object);
	if (proxy)
		reference.setProxy(proxy);
	return reference;
}

/* CreateIsolate creates a new object that can be shared over a network. This
 * object can be discovered over the network by other clients. Whenever the
 * object is discovered, a copy of this object is provided to the other client,
 * allowing access to the locally stored properties of the object. When
 * executing mutable methods (methods that change the state of the object), a
 * message is sent to the remote object over the network.
 * 
 * @Param object: a json object with all methods and properties of the object 
 */
function createIsolate(object) {
	return receptionist.createIsolate(object);
}

// CreateMessage creates a message that can be sent asynchronously 
// to remote objects of other clients 
function createMessage(method, arguments) {
	return connectionManager.createMessage(method, arguments);
}

// ExportAs exports the reference of an object to all other connected clients
function exportAs(nearReference, typetag) {
	receptionist.publishObject(nearReference, typetag);
	console.log("manual broadcast");
	connectionManager.broadcastObject(nearReference, typetag);
}

// WheneverDiscovered installs a callback that is executed whenever a remote
// object of type typetag is discovered.
function wheneverDiscovered(typetag, callback) {
	connectionManager.wheneverDiscovered(typetag, callback);
}

// CreateReferenceProxy creates a proxy for a reference. The function takes a
// behaviour function: a function with the formal parameter parent which implements
// the function onReceive and onPassReference
function createReferenceProxy(behaviour) {
	return receptionist.createReferenceProxy(behaviour);
}

module.exports.online  				 = online;
module.exports.createObject			 = createObject;
module.exports.createIsolate		 = createIsolate;
module.exports.exportAs 			 = exportAs;
module.exports.wheneverDiscovered 	 = wheneverDiscovered;
module.exports.createMessage 		 = createMessage;
module.exports.createReferenceProxy  = createReferenceProxy;
module.exports.events 			     = cm.events;
},{"./connectionManager":4,"./discoveryManager":5,"./receptionist":16}],2:[function(require,module,exports){
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
},{"./tcp-sockets":3,"wolfy87-eventemitter":18}],3:[function(require,module,exports){
/****************************************************************************
 * TCP Sockets for Cordova by Kevin De Porre                                *
 *                                                                          *
 * Provides listening and connecting sockets.                               *
 * To establish a connection a connecting socket must connect with a        *
 * listening socket.                                                        *
 *                                                                          *
 * Both types of sockets are stored in their own dictionnary.               *
 * Those DCTs map the hostname of the socket to the socket.                 *
 * For connecting sockets the hostname is the ip address of the other peer. *
 * For listening sockets the hostname is the ip address of the peer we are  *
 * waiting for to connect with us.                                          *
 *                                                                          *
 * The implementation is based on WebRTC DataChannels.                      *
 * WebRTC don't allow to specify ports, hence the port arguments that are   *
 * passed to the sockets aren't used.                                       *
 *                                                                          *
 * An idea would be to use the port as a virtual port, only to uniquely     *
 * identify sockets. We could think that the string "<ip>:<port>" is        *
 * unique for every socket. But it is not! As every actor could have > 1    *
 * listening socket and they all use the same port (40401) ...              *
 *                                                                          *
 * Note: services published for setting up a socket connection use a        *
 *       dedicated service name ('_AmbientJS._tcp.local.') in order         *
 *       not to interfere with services published by AmbientJS.             *
 ****************************************************************************/

// Declare variables shared between the below functions
var zeroconf;
var RTCPeerConnection;
var RTCIceCandidate;
var RTCSessionDescription;

// Constants
var _SERVICE_TYPE_ = '_AmbientJS._tcp.local.';
var _SERVICE_PORT_ = 80;

var ownID; // Cordova plugin will set this once known
var config = { iceServers: [{url: "stun:stun.1.google.com:19302"}] };

// Below arrays are associative (i.e. dictionaries), mapping peer ID to the corresponding socket
var connectingSockets = []; 
var ownSockets = []; // stores listening sockets that are connected (i.e. valid)

// Below array contains all listening sockets that are not yet used (upon getting valid they are removed from this array and stored in "ownSockets" DCT).
var listeningSockets = [];


/*
 * The first 2 arrays below store the candidates we received, in order to be 
 * able to add them in the final step of the handshake for WebRTC DataChannel.
 * 
 * The remembered candidates array is used to catch candidates that are received to late.
 * Sometimes it can be that all steps of the WebRTC handshake have been done and we 
 * only need to add the candidates yet. But that the candidate(s) have not yet been received..
 * In that case we will remember in this array that we are still waiting for the candidates of a given socket.
 * Upon arrival of a candidate, we check if it is in the array and if it is we may immediately add it to the socket.
 */

var listening_candidate_array = [];
var connecting_candidate_array = [];
var rememberedCandidates = [];

// **************************************************************************

/*
 * Initializes the ZeroConf and (ios)RTC plugins.
 */

function initVariables() {
    zeroconf = cordova.plugins.zeroconf;

    // iosrtc plugin is only used on iOS
    if (window.device.platform === 'iOS') {
        // The iosrtc functions are in their own namespace, the below call will make them globally avalaible (e.g. window.RTCPeerConnection)
        cordova.plugins.iosrtc.registerGlobals();
    }

    // Overcome temporary browser differences
    RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
    RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.msRTCIceCandidate;
    RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

    if(typeof zeroconf === 'undefined')
        console.log("[ERROR]: ZeroConf plugin not ready!");
}

/*
 * Assigns all event handlers for a given WebRTC peer connection and channel.
 */

function setEventHandlers(peerConnection, channel, peerID, whichSocket) {
    channel.onmessage = function (event) {
        var str = event.data; // Received message
        var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID]; // Only peerID is not enough, we need to know in which array to search.

        // Received message must contain fields : "source" and "data", "data" must contain field "text"
        var txt = { text: str };
        var message = { source: socket, data: txt };

        // Fire 'read' event
        socket.eventEmitter.emit('read', message);
    };
    
    channel.onclose = function (event) {
        console.log(whichSocket + ' socket to/for ' + peerID + ' closed.');

        var socketArray = (whichSocket === 'listening') ? ownSockets : connectingSockets;
        var socket = socketArray[peerID];
        socket.state = "closed";

        // Delete socket from his array such that later he can reconnect
        delete socketArray[peerID];
    };
    
    channel.onerror = function (event) {
        var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
        socket.state = "error";

        console.log("[ERROR]: " + whichSocket + " socket to/for " + peerID + " encountered error.");
        console.error(event);
    };

    peerConnection.ondatachannel = function (ev) {
        ev.channel.onopen = function() {
            console.log("[INFO]: " + whichSocket + ' channel to ' + peerID + ' is open and ready to be used.');
            
            // Update the socket with the right peer connection and data channel.
            var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
            socket.peerConnection = peerConnection;
            socket.channel = ev.channel;

            socket.state = "connected";    
            socket.isValid = true;
        };
    };

    // On getting locally generated ICE
    peerConnection.onicecandidate = function (event) {
        if (!event || !event.candidate) return;
        var ICEcandidate = event.candidate;

        // Publish the candidate on the network
        var name = "_" + ownID + "_Candidate_"; // Name according to protocol : "_<ID>_Candidate_"
        var stringifiedCandidate = JSON.stringify(ICEcandidate);

        // If the candidate is on our listening socket it need to be added to the peer his connecting socket and vice versa !!!
        var reverse = (whichSocket === 'listening') ? 'connecting' : 'listening';

        zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
            'from': ownID,
            'to': peerID,
            'identification': reverse, // Identifies if the candidate must be added to the listening or connecting socket
            'type': 'Candidate',
            'data': stringifiedCandidate,
        });

    };
}

/***************
 * WebRTC Part *
 ***************/

/*
 * Setting up a WebRTC DataChannel requires following handshake :
 *    - Send an offer SDP to the peer and set it as your local description
 *    - Receive an offer answer SDP from the peer and set it as your remote description
 *    - On getting a locally generated ICE candidate, send it to the peer
 *    - On receiving an ICE candidate from the peer, add it to the connection (ONLY AFTER local and remote SDPs have been set !!!)
 */

function connectToPeer(socket) {
    // Remember socket as being a connecting socket to peerID
    var peerID = socket.hostName;
    connectingSockets[peerID] = socket;
    
    //console.log("[INFO]: Going to connect to " + peerID);

    // Make an RTCPeerConnection and DataChannel, than store it in the socket
    var peerConnection = new RTCPeerConnection(config);
    var channel = peerConnection.createDataChannel("RTCDataChannel"); // reliable channel by default

    socket.channel = channel;
    socket.peerConnection = peerConnection;

    /* 
     * Set all event handlers for the peer connection and channel.
     * 'connecting' argument identifies that it need to set the
     * event handlers for the connecting socket to peerID.
     */

    setEventHandlers(peerConnection, channel, peerID, 'connecting');

    peerConnection.createOffer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);

        // Publish our offer on the network
        var name = "_" + ownID + "_Offer_"; // Name according to protocol : "_<ID>_Offer_"
        var stringifiedSDP = JSON.stringify(sessionDescription);

        // The stringified offer is too long to put in one field and publish the service --> Need to be cut into 2 parts for some unknown reason...
        var p1 = stringifiedSDP.substring(0, (stringifiedSDP.length / 2));
        var p2 = stringifiedSDP.substring((stringifiedSDP.length / 2));

        // Use a dedicated service name ('_AmbientJS._tcp.local.') for the exhange of connection information in order not to interfere with AmbientJS services
        zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
            'from' : ownID,
            'to'   : peerID,
            'type' : 'Offer',
            'data1': p1,
            'data2': p2,
        });
    });
};


/*
 * Wrap zeroconf.watch call in a function because "ownID" need to be known at the time of calling.
 * Hence, the cordova plugin will call this function with its own id (ip address).
 * At this time we can also be sure that the device is ready. Thus we can initialize the variables (zeroconf plugin, etc.)
 */

function initZeroConf(ownHostName) {
    initVariables();
    ownID = ownHostName;

    // Register for services with type '_AmbientJS._tcp.local.' on the network
    zeroconf.watch(_SERVICE_TYPE_, function(result) {
        var action = result.action;
        var name = result.service.name;
        var service = result.service.txtRecord;

        //console.log("[DEBUG]: Found service " + name + " with type " + service.type + " from " + service.from + " to " + service.to);

        // Make sure the offer is intended for us 
        if(action == 'added' && service.type === 'Offer' && service.to === ownID) {

            /*
             * Receiving an offer means we need a listening socket.
             * On receiving an offer from a peer, "process" it and then create answer SDP and send it back to offerer.
             * The service was intended for us, hence we unregister it from the network, in order not to be processed more than once.
             */

            zeroconf.unregister(_SERVICE_TYPE_, name);
            //console.log("[DEBUG]: Received offer from " + service.from);

            // Fetch listening socket for the corresponding peer
            var socket;
            if(listeningSockets.length === 0) {
                console.log("[ERROR]: No listening sockets.");
                return;
            }
            else {
                for(var i=0; i<listeningSockets.length; i++) {
                    if(listeningSockets[i].listeningSocketForHost === service.from) {
                        // We found the listening socket that was waiting for this given peer to connect with us
                        socket = listeningSockets[i];
                        listeningSockets.splice(i, 1); // Remove socket from array
                        break;
                    }
                }
            }

            if(typeof(socket) === 'undefined' || socket.state !== "listening") {
                console.log("[ERROR]: Expected socket to be listening.");
                return;
            }

            // Remember the socket in the DCT of valid listening sockets
            ownSockets[service.from] = socket;

            // Receiving an offer means we do not yet have a peerconnection to that peer
            var peerConnection = new RTCPeerConnection(config);
            var channel = peerConnection.createDataChannel("RTCDataChannel");

            socket.channel = channel;
            socket.peerConnection = peerConnection;

            // Set all eventhandlers for the peer connection and data channel
            setEventHandlers(peerConnection, channel, service.from, 'listening');

            // Set our remote description to the one we received
            var offer = JSON.parse(service.data1 + service.data2); // data1, data2 both contain parts of the offer SDP
            peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create an answer
            peerConnection.createAnswer(function (sessionDescription) {
                peerConnection.setLocalDescription(sessionDescription);
                
                // Publish our (offer) answer SDP on the network
                var name = "_" + ownID + "_OfferAnswer_"; // Name according to protocol : "_<ID>_OfferAnswer_"
                var stringifiedSDP = JSON.stringify(sessionDescription);

                // The stringified offer answer is too long to put in one field and publish the service --> Need to be cut into 2 parts for some unknown reason...
                var p1 = stringifiedSDP.substring(0, (stringifiedSDP.length / 2));
                var p2 = stringifiedSDP.substring((stringifiedSDP.length / 2));

                zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
                    'from' : ownID,
                    'to'   : service.from,
                    'type' : 'OfferAnswer',
                    'data1': p1,
                    'data2': p2
                });

                // Now that we set the local and remote descriptions we must set all received candidates that are intended for THIS listening socket
                addCandidatesToConnection(service.from, 'listening');
            });
        }
        else if(action == 'added' && service.type === 'OfferAnswer' && service.to === ownID) {
            
            /* 
             * Receiving an offer answer means we sent an offer, hence, we have a connecting socket.
             * On receiving an answer set the remote description on the received answer.
             */

            //console.log("[DEBUG]: Received offer answer from " + service.from);

            // Fetch peerConnection
            var socket = connectingSockets[service.from];
            if(typeof(socket) === 'undefined') {
                console.log("[ERROR]: Expected to have a connecting socket.");
                return;
            }

            var peerConnection = socket.peerConnection;
            var answerSDP = JSON.parse(service.data1 + service.data2); // data1 and data2 both contain parts of the answer SDP

            // Set remote description
            peerConnection.setRemoteDescription(new RTCSessionDescription(answerSDP));

            // Now that we set the local and remote descriptions we must set all received candidates that are intended for THIS connecting socket
            addCandidatesToConnection(service.from, 'connecting');

            // Unregister service from the network, in order not to be processed more than once 
            zeroconf.unregister(_SERVICE_TYPE_, name);
        }
        else if(action == 'added' && service.type === 'Candidate' && service.to === ownID) {
            // On getting ICE candidate sent by other peer

            /* 
                We may NOT immediately add the candidate to the peer connection !!! 
                It must be done after the local and remote SDPs (descriptions) have been added
                --> Not respecting this order won't open the RTC DataChannel (onopen event)

                Hence, we put a callback in the listening/connecting candidate array which we will call after having set both descriptions.
            */

            var addCandidate = function(ICEcandidate, peerID, identification) {
                // Retrieve the peerConnection corresponding to the peer that send us the candidate
                var socket = (identification === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
                if(socket) {
                    var peerConnection = socket.peerConnection;

                    // Add the candidate to the connection
                    peerConnection.addIceCandidate(new RTCIceCandidate({
                        sdpMLineIndex: ICEcandidate.sdpMLineIndex,
                        candidate: ICEcandidate.candidate
                    }));
                }
            };

            // Check if that user already sent us some candidates
            var identification = service.identification;
            var candidate_array = (service.identification === 'listening') ? listening_candidate_array : connecting_candidate_array;

            var candidates = candidate_array[service.from];
            var thisCandidate = { candidate: JSON.parse(service.data), fn: addCandidate }; // Put argument and callback in an object

            if(candidates) {
                // Add this candidate to the array containing all candidates for the given socket
                candidates.push(thisCandidate);
            }
            else {
                // Make an array that stores the candidate and set it in the listening/connecting candidate array
                candidates = [ thisCandidate ];
                candidate_array[service.from] = candidates;
            }


            /*
             * Sometimes a candidate may be received after we set the local and remote SDPs.
             * The below piece of code will check if that was the case and if it is,
             * immediately add the candidate to the connection.
             */

            var waiting = false; // Indicates if we were waiting for this candidate to arrive
            for(var i=0; i<rememberedCandidates.length; i++) {
                if((service.from === rememberedCandidates[i].peerID) && (service.identification === rememberedCandidates[i].identification)) {
                    // Remembered in "rememberedCandidates" array, hence we were waiting for this candidate
                    waiting = true;
                    rememberedCandidates.splice(i, 1); // Remove from array
                    break;
                }
            }

            if(waiting)
                addCandidatesToConnection(service.from, service.identification);

            // Clean up
            zeroconf.unregister(_SERVICE_TYPE_, name);
        }
    });
};


/*
 * Removes the candidates that were stored in listening/connecting candidate array and adds them to the connection.
 */ 

function addCandidatesToConnection(peerID, identification) {
    var candidate_array = (identification === 'listening') ? listening_candidate_array : connecting_candidate_array;
    var candidates = candidate_array[peerID];

    if(typeof(candidates) !== 'undefined') {
        // Call all candidate callbacks (for the given socket) we remembered before
        for(var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i].candidate;
            var fun = candidates[i].fn;
            fun(candidate, peerID, identification);
        }

        // Remove added candidates from "candidate_array"
        delete candidate_array[peerID];
    }
    else {
        // Remember that on receiving a candidate from peerID, it still has to be added to the listening/connecting socket.
        rememberedCandidates.push({ 'peerID': peerID, 'identification': identification });
    }
}

module.exports.listeningSockets   = listeningSockets;
module.exports.connectToPeer      = connectToPeer;
module.exports.initZeroConf       = initZeroConf;
},{}],4:[function(require,module,exports){
var util	      = require('./util');
var ObjectID 	  = require('./objectID').ObjectID;
var sendSecure 	  = util.sendSecure;
var retrieveJSON  = util.retrieveJSON;
var ambientModule = util.ambientModule;



function ConnectionManager() {
	var receptionist;
	
	var heartBeats = {};
	var discoveredCallbacks = {};
	var connections = {};
	
		
	
	// Send a heartbeat containing the connection information of the current client,
	// allowing other clients to manually open a socket connection. 
	function sendHeartbeat(hostName) {
		var socket 	  = connections[hostName];
		var heartBeat = {"messagetype":"heartbeat", "hostName": util.address.val, "port": util.port};
		sendSecure(socket, hostName, JSON.stringify(heartBeat));		
	};
	
	// Send a response of an asynchronous method invocation to the client that requested the invocation
	function sendResponse(socket, value, serializedObjectID, serializedFutureID) {
		if (value && 
			((value.constructor == "remoteFarReference")  || 
			 (value.constructor == "isolateFarReference") ||
			 (value.constructor == "localFarReference")   ||
			 (value.constructor == "localIsoFarReference"))) {
			var objectID = new ObjectID(serializedObjectID);
			var reference;
			console.log(value.constructor);
			if ((value.constructor == "remoteFarReference") || (value.constructor == "isolateFarReference")) {
				reference = receptionist.getRemoteFarReference(value.getObjectID());
				value 	  = receptionist.getRemoteFarReference(value.getObjectID());
			
			} else {
				reference = receptionist.getObjectReference(new ObjectID(serializedObjectID));
				value 	  = receptionist.getObjectReference(value.getObjectID());
			}
			reference.onPassReference(value);
			value = value.serialize();
		}
		var response = {"messagetype":"response", "value": value, "objectID":serializedObjectID, "futureID":serializedFutureID};
		var host = new ObjectID(serializedFutureID).getHost();
		sendSecure(socket, host, JSON.stringify(response));
	};
	
	// Send an asynchronous method invocation to some remote object (identified by objectID)
	function sendMessage(msg, objectID, futureID) {
		var connection = connections[objectID.getHost()];
		msg.objectID = objectID.serialize();
		if (futureID)
			msg.futureID = futureID.serialize();
		if (connection) {
			sendSecure(connection, objectID.getHost(), JSON.stringify(msg));
		}
	};
	
	// Process incoming response as a result of an asynchronous invocation on a remote object
	this.processResponse = function(message) {
		receptionist.resolve(message.objectID, message.futureID, message.value);
	};
	
	/* 
	 * Check if the socket connection is valid. The socket can get valid as a result of the resolution
	 * of the socket, or can be replaced by a manually defined socket based on heartbeat information.
	 * Optimized for Cordova to use only one socket for inter-actor communication in both directions.
	 */
	function checkConnection(serviceName, socket, aCtr, ownSocket, messageProcessor) {
		function checkLoop(ctr) {
			// resolved socket is valid; send heart beat (containing own connection info) to client
			
			if (socket.isValid || (util.cordova && ownSocket.isValid)) {
				//console.log("connection stored with name: " + serviceName);

				/* 
				 * Note for Cordova :
				 * WebRTC is still an experimental technology. Setting up a socket can take some time.
				 *
 				 * Optimization: Sockets are bidirectional hence we only need one.
 				 * Take the one that is the first to be connected with the remote actor.
 				 * If both are connected at the time of checking, choose the socket pointing to the actor with the smallest ip.
 				 * --> This "protocol" ensures both actors will choose the same socket in that particular case.
				 */

				var choosenSocket;

				if (util.cordova) {

					if (socket.isValid && ownSocket.isValid && typeof(connections[serviceName]) !== 'undefined')
						choosenSocket = connections[serviceName]; // Both connections are still valid, stay with the same connection
					else if (socket.isValid && ownSocket.isValid)
						choosenSocket = (isIpLesser(socket.hostName, ownSocket.hostName)) ? socket : ownSocket;
					else if (socket.isValid)
						choosenSocket = socket;
					else if (ownSocket.isValid)
						choosenSocket = ownSocket;

					/*
					 * Close the other socket 
					 * --> could result in problems if the socket we are going to close is not yet valid (because the other peer won't see that it has been closed).
					 */
					//if(choosenSocket === socket) ownSocket.close();
					//else socket.close();
				}
				else
					choosenSocket = socket;

				connections[serviceName] = choosenSocket;
				var objects = receptionist.getPublishedObjects();
				// notify newly added client all of all published objects
				for (var typetag in objects){
					objects[typetag].forEach(function (objectID) {
						var nearReference = receptionist.getObjectReference(objectID).publicInterface;
						var strategy = (nearReference.constructor == "localFarReference") ? "by_reference" : "by_copy";
						unicastObject(serviceName, strategy, objectID, typetag);
					});
				};
				// send messages from outbox of far reference to the client
				var references = receptionist.getRemoteFarReferences(serviceName);

				references.forEach(function (reference) {
					reference.getOutbox().forEach(function(letter) {
						sendMessage(letter.message, letter.objectID, letter.futureID);
					});
				});
				// Send a heartbeat containing connection info to other client
				sendHeartbeat(serviceName);
			// client received a heartbeat from other client, resolve socket manually
			} else if (heartBeats[serviceName] && (ctr > 8)) {
				//console.log("using heartbeat info for: " + serviceName);
				if (util.nodejs) {
					socket = ambientModule.module.createTCPSocket();
					socket.on('data', function(rawData) {
						messageProcessor(message);
					});
					socket.connect(heartBeats[serviceName], serviceName);
					socket.isValid = true;
				} else {
					socket = ambientModule.module.createTCPSocket({
						hostName: serviceName,
						port: heartBeats[serviceName],
						mode: util.rw_mode
					});
					socket.addEventListener('read', function(x) {
						messageProcessor(message);
					});
					socket.connect();
				}
				delete heartBeats[serviceName];
				checkLoop(0);
			}
			// keep waiting for valid socket connection for 30 seconds 
			else if (ctr < 100) {
				setTimeout(function(){checkLoop(ctr+1);}, 300);				
			}
		}
		if (aCtr)
			checkLoop(aCtr);
		else
			checkLoop(0);
	};
	
	
	function unicastObject(hostName, strategy, objectID, typetag) {
		var message = {"messagetype" : "publishedObject", "distributionStrategy": strategy,  
					   "objectID" : objectID.serialize(), "TypeTag" : typetag};
		var socket = connections[hostName];
		if (strategy == "by_copy")
			message["mutableList"] = receptionist.getMutableList(objectID);
		console.log("broadcasting object with type:"+typetag+"and strategy: " + strategy);
		sendSecure(socket, hostName, JSON.stringify(message));
	}
	
	/*********************************
	 * Interface (host)				 *
	 *********************************/
	
	this.start = function(aReceptionist) {
		receptionist = aReceptionist;
	};
	
	
	/*********************************
	 * Interface (receptionist) 	 *
	 *********************************/
	
	this.sendMessage = sendMessage;
	
	this.sendResponse = sendResponse;
	
	this.broadcastObject = function (nearReference, typetag) {
		var objectID = nearReference.getObjectID();
		var strategy = (nearReference.constructor == "localFarReference") ? "by_reference" : "by_copy";
		for (var host in connections) {
			unicastObject(host, strategy, objectID, typetag);
		};
	};
	
	this.createMessage = function(method, arguments) {
		arguments = arguments.map(function(arg){
			if (arg && (
				(arg.constructor == "remoteFarReference")  || 
				(arg.constructor == "isolateFarReference") ||
				(arg.constructor == "localFarReference")   ||
				(arg.constructor == "localIsoFarReference"))) {
				var reference;
				if ((arg.constructor == "remoteFarReference") || (arg.constructor == "isolateFarReference"))
					reference = receptionist.getRemoteFarReference(arg.getObjectID());
				else
					reference = receptionist.getObjectReference(arg.getObjectID);
				
				reference.onPassReference(arg);
				return reference.serialize();
			} else
				return arg;
		});
		var message = {"messagetype" : "asyncMessage", "method" : method, "arguments" : arguments};
		return message;
	};
	
	this.wheneverDiscovered = function(typetag, callback) {
		discoveredCallbacks[typetag] = callback;
		
		var list = receptionist.getRemoteFarReferencesTypeTag(typetag);
		list.forEach(function(reference){
			callback(reference);
		});
	};
	
	this.checkAvailability = function(host) {
		return (typeof connections[host] == "object");
	};
	
	
	/*********************************
	 * Interface (discovery manager) *
	 *********************************/
	// If a new service is discovered, a connection the the client will be resolved
	this.addConnection = function(service, socket, messageProcessor) {
		//console.log("adding connection");
		service.resolve();
		//validate the socket connection to the remote client
		checkConnection(service.name, service.socket, false, socket, messageProcessor); // Pass received socket and own socket, checkConnection will determine which one to use

		//install response listener
		service.socket.addEventListener('read', function(x) {
			messageProcessor(x);
		});
		//connect the socket
		service.socket.connect();
	};
	
	//Process functions to process incoming heartbeat message
	this.processHeartbeat = function(message) {
		if (message.hostName && message.port) {
			heartBeats[message.hostName] = message.port;
			if (util.nodejs)
				checkConnection(message.hostName, {"isValid":false}, 9);
		} else
			console.log("[ERROR] Invalid heartbeat message");
	};
	
	//Process functions to process incoming discovered object message
	this.processDiscoveredObject = function(message) {
		if (message.objectID && message.TypeTag) {
			console.log("discovered remote object with strategy:" + message.distributionStrategy + "with: " + message.mutableList);
			var serializedObjectID = message.objectID;
			var farReference = receptionist.addDiscoveredObject(new ObjectID(serializedObjectID), message.TypeTag, null, message.distributionStrategy, message.mutableList);
			if (typeof discoveredCallbacks[message.TypeTag] == "function")
				discoveredCallbacks[message.TypeTag](farReference);
		} else
			console.log("[ERROR] Invalid discovered object message");
	};
	
	//Process functions to process incoming async message
	this.processAsyncMessage = function(message) {
		var serializedObjectID = message.objectID;
		var reference = receptionist.getObjectReference(new ObjectID(serializedObjectID));
		message.arguments = message.arguments.map(function(arg){
				if ((typeof arg == "string") && (arg.indexOf("referenceID")>-1)) {
					var passedReference = JSON.parse(arg);
					var passedTypeTag   = passedReference.referenceTypeTag;
					var passedProxy     = passedReference.referenceProxy;
					var strategy        = passedReference.referenceType;
					var mutableList     = passedReference.referenceMutableList;
					if (passedProxy) {
						while (passedProxy.indexOf("\\t")>-1)
								passedProxy = passedProxy.replace("\\t", "\t");
						while (passedProxy.indexOf("\\n")>-1)
							passedProxy = passedProxy.replace("\\n", "\n");
						while (passedProxy.indexOf('\\"')>-1)
							passedProxy = passedProxy.replace('\\"', '\"');
						passedProxy = new Function("return " + passedProxy)();
						passedProxy = new ReferenceProxy(passedProxy);
					}
					console.log("making a reference");
					return receptionist.addDiscoveredObject(new ObjectID(JSON.stringify(passedReference.referenceID)), passedTypeTag, passedProxy, strategy, mutableList);
				}
				else
					return arg;
		});
		if (reference)
			reference.onReceive(message);
	};
	
	// Send a request for the local copy of a received isolate
	this.requestIsolateCopy = function(objectID, futureID) {
		var connection = connections[objectID.getHost()];
		var request = {"messagetype":"isolateRequest", "objectID":objectID.serialize(),"futureID":futureID.serialize()};
		console.log(connection);
		console.log(request);

		sendSecure(connection, objectID.getHost(), JSON.stringify(request));
	};
	
	//Process request for a copy of a locally stored isolate
	this.processIsolateRequest = function(message) {
		var serializedObjectID = message.objectID;
		var serializedFutureID = message.futureID;
		var copy = receptionist.getObject(new ObjectID(serializedObjectID));
		var serializedCopy = JSON.stringify(copy, function(key, val) {
			return (typeof val === 'function') ? val.toString() : val;
		});
		receptionist.registerForIsolate(new ObjectID(serializedObjectID), new ObjectID(serializedFutureID).getHost());
		this.sendResponse(message.source, serializedCopy, serializedObjectID, serializedFutureID);
	};

	//Push an updated version of a distributed isolate to a host
	this.sendIsolateUpdate = function(host, objectID) {
		if (this.checkAvailability(host)) {
			var message = {"messagetype":"isolateUpdate", "objectID":objectID.serialize()};
			console.log(message);
			sendSecure(connections[host], host, JSON.stringify(message));
		};
	};

	//Process the notification of a new update of an isolate
	this.processIsolateUpdate = function(message) {
		var serializedObjectID = message.objectID;
		var reference = receptionist.getRemoteFarReference(new ObjectID(serializedObjectID));

		reference.updateObject();
	};

	/*
	 * Determines smallest of two ip addresses.
	 * Used by addConnection in order to determine which socket to remember for the given host (both will use the same in order to use only one socket).
	 * We split on '/' because this function will only be used when running in Cordova.
	 */
	 function isIpLesser(first, second) {
	 	// Put numbers of both ip addresses in an array, then compare the arrays.
	 	var arr1 = first.split('.').map(function(x) { return Number(x); });
	 	var arr2 = second.split('.').map(function(x) { return Number(x); });

	 	for(i=0; i<arr1.length; i++) {
	 	    if(arr1[i] > arr2[i]) {
	 	        return false;
	 	    }
	 	}

	 	return true;
	 }
}


module.exports.ConnectionManager = ConnectionManager;
module.exports.events            = util.events;
},{"./objectID":14,"./util":17}],5:[function(require,module,exports){
var util 		  = require('./util');
var retrieveJSON  = util.retrieveJSON;
var ambientModule = util.ambientModule;


function DiscoveryManager(connectionManager) {
	var bonjourSocket;
	var serviceBrowser;
	var localService;

	/*
	 * messageProcessor processes all messages received by the global tcp socket.These
	 * messages can be:
	 * 		- heartbeat messages: message containing connection information 
	 * 							  (IP address + port) to connect to the sending actor
	 * 		- discoveredObject messages: message containing the information of a
	 * 									 remote object exported by other actor
	 * 		- asyncMessage messages: message containing information of message sent
	 * 								 from other actor to an exported object
	 *      - response messages: response on a message send to an actor
	 */

	function messageProcessor(rawData, aSource) {
		var source;
		if (util.nodejs) {
			source = aSource;
			rawData = rawData.toString('utf8');
		} else {
			source = rawData.source;
		    rawData = rawData['data'].text;
		} 
		var messages = retrieveJSON(rawData);
		messages.forEach(function(message) {
			message.source = source;
			switch(message.messagetype) {
				case "heartbeat"	  : connectionManager.processHeartbeat(message); break;
				case "publishedObject": connectionManager.processDiscoveredObject(message); break;
				case "asyncMessage"   : connectionManager.processAsyncMessage(message); break;
				case "isolateRequest" : connectionManager.processIsolateRequest(message); break;
				case "isolateUpdate"  : connectionManager.processIsolateUpdate(message); break;
				case "response"		  : connectionManager.processResponse(message); break;
				default				  : console.log("[WARNING] Received invalid message: " + JSON.stringify(message));
			}
		});
	}
	/*
	 * startMessageListener installs a tcp socket, on which incoming messages from 
	 * other (discovered) actors will be received. The received messages are passed
	 * to the message processor.
	 * Note that for Cordova we need to install a listening socket per discovered actor.
	 * Hence, it is done in startActorBrowser. 
	 */
	function startMessageListener(){
		if (util.nodejs) {
			bonjourSocket = ambientModule.module.createServerSocket(function(socket){
				socket.on('data', function(data) {
					messageProcessor(data, socket);
				});
			});
			bonjourSocket.listen(util.port);
		} else {
			/* 
			 * In Cordova this is only used such that "startActorService" can make ourself known on the network. 
			 * No actor will connect to this socket, instead a listening socket will be made for every discovered actor.
			 */
			bonjourSocket = ambientModule.module.createTCPSocket({
				hostName: util.address.val,
				port: util.port,
				mode: util.rw_mode
			});

			bonjourSocket.addEventListener('read', function(data) {
				messageProcessor(data);
			});
			bonjourSocket.listen();
		}
	};
	
	
	/*
	 * startActorService will publish the service of the current client on the network.
	 */
	function startActorService() {
		localService = ambientModule.module.createBonjourService({
			name:util.address.val,
			type:'_ambient._tcp',
			domain:'local.'
		});
		if (bonjourSocket) {
			localService.publish(bonjourSocket);
			//console.log("[INFO] Client is online");
		} else
			console.log("[ERROR] Receiving socket not initialized.");
	};
	
	
	
	/*
	 * startActorBrowser installs a service discovery browser that will discover 
	 * services published by other actors.
	 */
	function startActorBrowser(){
		
		var updateServicesCallback = function(e) {
			var services = e['services'];
			//When service is not available anymore: i.e. disconnected, notify all remoteReferences
			//in receptionist to call there when:disconnected callback + let the remoteReference buffer
			//outgoing messages. TODO	
			for (var i=0; i<services.length; i++) {
				var service = services[i];
				//console.log(JSON.stringify(service));
				//Discovered new remote service
				console.log("Found actor : " + service.name);
				
				if(util.cordova) {
					/* 
					 * Make a new listening socket such that the remote peer is able to connect with us.
					 * This is cordova specific code because the implementation of TCP sockets for Cordova
					 * requires a listening socket for every actor trying to connect with us via his connecting socket.
					 */
					bonjourSocket = ambientModule.module.createTCPSocket({
						hostName: util.address.val,
						port: util.port,
						mode: util.rw_mode
					});
					
					bonjourSocket.listeningSocketForHost = service.name; // Explicitly mark for which peer this listening socket is intended.

					bonjourSocket.addEventListener('read', function(data) {
						messageProcessor(data);
					});
					bonjourSocket.listen();
				} 

				// Add the connection
				if ((service.name != util.address.val) && (service.socket == null)) {
					connectionManager.addConnection(service, bonjourSocket, messageProcessor);
				}
			};
		};
		
		serviceBrowser = ambientModule.module.createBonjourBrowser({
			serviceType:'_ambient._tcp',
			domain:'local.'
		});
		
		serviceBrowser.addEventListener('updatedServices', updateServicesCallback);
		serviceBrowser.search();
	};
	
	
	
	/*
	 *  discoverServer will add a connection to a nodejs server running AmbientJS if a
	 *  serverURL is specified in the config file
	 */
	function discoverServer(){
		if (util.serverurl) {
			var service = {
				"resolve" : function(){},
				"name"	  : util.serverurl,
				"socket"  : ambientModule.module.createTCPSocket({
								hostName:util.serverurl,
								port:util.serverport,
								mode:util.rw_mode   
							})
			};
			
			connectionManager.addConnection(service);
		}		
	}
	
	/*************************
	 * Interface			 *
	 *************************/
	
	this.goOnline = function(){
		startMessageListener();
		if (!util.nodejs) {
			startActorService();
			startActorBrowser();
			discoverServer();
		}
	};
}


module.exports.DiscoveryManager = DiscoveryManager;
},{"./util":17}],6:[function(require,module,exports){
/*!Copyright (c) 2009 pidder <www.pidder.com>*/
/*----------------------------------------------------------------------------*/
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA
// 02111-1307 USA or check at http://www.gnu.org/licenses/gpl.html

/*----------------------------------------------------------------------------*/
/*
*  pidCrypt AES core implementation for block en-/decryption for use in pidCrypt
*  Library.
*  Derived from jsaes version 0.1 (See original license below)
*  Only minor Changes (e.g. using a precompiled this.SBoxInv) and port to an
*  AES Core Class for use with different AES modes.
*
*  Depends on pidCrypt (pidcrypt.js, pidcrypt_util.js)
/*----------------------------------------------------------------------------*/
/*    jsaes version 0.1  -  Copyright 2006 B. Poettering
 *    http://point-at-infinity.org/jsaes/
 *    Report bugs to: jsaes AT point-at-infinity.org
 *
 *
 * This is a javascript implementation of the AES block cipher. Key lengths
 * of 128, 192 and 256 bits are supported.
 * The well-functioning of the encryption/decryption routines has been
 * verified for different key lengths with the test vectors given in
 * FIPS-197, Appendix C.
 * The following code example enciphers the plaintext block '00 11 22 .. EE FF'
 * with the 256 bit key '00 01 02 .. 1E 1F'.
 *    AES_Init();
 *    var block = new Array(16);
 *    for(var i = 0; i < 16; i++)
 *        block[i] = 0x11 * i;
 *    var key = new Array(32);
 *    for(var i = 0; i < 32; i++)
 *        key[i] = i;
 *    AES_ExpandKey(key);
 *    AES_Encrypt(block, key);
 *    AES_Done();
/*----------------------------------------------------------------------------*/
var pidCrypt = require('./pidcrypt').pidCrypt;

if(typeof(pidCrypt) != 'undefined'){
  pidCrypt.AES = function(env) {
    this.env = (env) ? env : new pidCrypt();
    this.blockSize = 16;  // block size fixed at 16 bytes / 128 bits (Nb=4) for AES
    this.ShiftRowTabInv; //initialized by init()
    this.xtime; //initialized by init()
    this.SBox = new Array(
      99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,
      118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,183,253,
      147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,
      7,18,128,226,235,39,178,117,9,131,44,26,27,110,90,160,82,59,214,179,41,227,
      47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,208,239,170,
      251,67,77,51,133,69,249,2,127,80,60,159,168,81,163,64,143,146,157,56,245,
      188,182,218,33,16,255,243,210,205,12,19,236,95,151,68,23,196,167,126,61,
      100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,224,
      50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,
      78,169,108,86,244,234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,
      116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,
      158,225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,
      137,13,191,230,66,104,65,153,45,15,176,84,187,22
    );
    this.SBoxInv = new Array(
      82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,
      251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,
      166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,
      162,73,109,139,209,37,114,248,246,100,134,104,152,22,212,164,92,204,93,101,
      182,146,108,112,72,80,253,237,185,218,94,21,70,87,167,141,157,132,144,216,
      171,0,140,188,211,10,247,228,88,5,184,179,69,6,208,44,30,143,202,63,15,2,193,
      175,189,3,1,19,138,107,58,145,17,65,79,103,220,234,151,242,207,206,240,180,
      230,115,150,172,116,34,231,173,53,133,226,249,55,232,28,117,223,110,71,241,
      26,113,29,41,197,137,111,183,98,14,170,24,190,27,252,86,62,75,198,210,121,32,
      154,219,192,254,120,205,90,244,31,221,168,51,136,7,199,49,177,18,16,89,39,
      128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,
      59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,
      225,105,20,99,85,33,12,125
    );
    this.ShiftRowTab = new Array(0,5,10,15,4,9,14,3,8,13,2,7,12,1,6,11);
  };
/*
init: initialize the tables needed at runtime. Call this function
before the (first) key expansion.
*/
  pidCrypt.AES.prototype.init = function() {
    this.env.setParams({blockSize:this.blockSize});
    this.ShiftRowTabInv = new Array(16);
    for(var i = 0; i < 16; i++)
      this.ShiftRowTabInv[this.ShiftRowTab[i]] = i;
    this.xtime = new Array(256);
    for(i = 0; i < 128; i++) {
      this.xtime[i] = i << 1;
      this.xtime[128 + i] = (i << 1) ^ 0x1b;
    }
  };
/*
AES_ExpandKey: expand a cipher key. Depending on the desired encryption
strength of 128, 192 or 256 bits 'key' has to be a byte array of length
16, 24 or 32, respectively. The key expansion is done "in place", meaning
that the array 'key' is modified.
*/
  pidCrypt.AES.prototype.expandKey = function(input) {
    var key = input.slice();
    var kl = key.length, ks, Rcon = 1;
    switch (kl) {
      case 16: ks = 16 * (10 + 1); break;
      case 24: ks = 16 * (12 + 1); break;
      case 32: ks = 16 * (14 + 1); break;
      default:
        alert("AESCore.expandKey: Only key lengths of 16, 24 or 32 bytes allowed!");
    };
    for(var i = kl; i < ks; i += 4) {
      var temp = key.slice(i - 4, i);
      if (i % kl == 0) {
        temp = new Array(this.SBox[temp[1]] ^ Rcon, this.SBox[temp[2]],
                         this.SBox[temp[3]], this.SBox[temp[0]]);
        if ((Rcon <<= 1) >= 256)
          Rcon ^= 0x11b;
      }
      else if ((kl > 24) && (i % kl == 16))
        temp = new Array(this.SBox[temp[0]], this.SBox[temp[1]],
      this.SBox[temp[2]], this.SBox[temp[3]]);
      for(var j = 0; j < 4; j++)
        key[i + j] = key[i + j - kl] ^ temp[j];
    }
    return key;
  };
/*
AES_Encrypt: encrypt the 16 byte array 'block' with the previously
expanded key 'key'.
*/
  pidCrypt.AES.prototype.encrypt = function(input, key) {
    var l = key.length;
    var block = input.slice();
    this.addRoundKey(block, key.slice(0, 16));
    for(var i = 16; i < l - 16; i += 16) {
      this.subBytes(block);
      this.shiftRows(block);
      this.mixColumns(block);
      this.addRoundKey(block, key.slice(i, i + 16));
    };
    this.subBytes(block);
    this.shiftRows(block);
    this.addRoundKey(block, key.slice(i, l));

    return block;
  };
/*
AES_Decrypt: decrypt the 16 byte array 'block' with the previously
expanded key 'key'.
*/
  pidCrypt.AES.prototype.decrypt = function(input, key) {
    var l = key.length;
    var block = input.slice();
    this.addRoundKey(block, key.slice(l - 16, l));
    this.shiftRows(block, 1);//1=inverse operation
    this.subBytes(block, 1);//1=inverse operation
    for(var i = l - 32; i >= 16; i -= 16) {
      this.addRoundKey(block, key.slice(i, i + 16));
      this.mixColumns_Inv(block);
      this.shiftRows(block, 1);//1=inverse operation
      this.subBytes(block, 1);//1=inverse operation
    }
    this.addRoundKey(block, key.slice(0, 16));

    return block;
  };
  pidCrypt.AES.prototype.subBytes = function(state, inv) {
    var box = (typeof(inv) == 'undefined') ? this.SBox.slice() : this.SBoxInv.slice();
    for(var i = 0; i < 16; i++)
      state[i] = box[state[i]];
  };
  pidCrypt.AES.prototype.addRoundKey = function(state, rkey) {
    for(var i = 0; i < 16; i++)
      state[i] ^= rkey[i];
  };
  pidCrypt.AES.prototype.shiftRows = function(state, inv) {
    var shifttab = (typeof(inv) == 'undefined') ? this.ShiftRowTab.slice() : this.ShiftRowTabInv.slice();
    var h = new Array().concat(state);
    for(var i = 0; i < 16; i++)
      state[i] = h[shifttab[i]];
  };
  pidCrypt.AES.prototype.mixColumns = function(state) {
    for(var i = 0; i < 16; i += 4) {
      var s0 = state[i + 0], s1 = state[i + 1];
      var s2 = state[i + 2], s3 = state[i + 3];
      var h = s0 ^ s1 ^ s2 ^ s3;
      state[i + 0] ^= h ^ this.xtime[s0 ^ s1];
      state[i + 1] ^= h ^ this.xtime[s1 ^ s2];
      state[i + 2] ^= h ^ this.xtime[s2 ^ s3];
      state[i + 3] ^= h ^ this.xtime[s3 ^ s0];
    }
  };
  pidCrypt.AES.prototype.mixColumns_Inv = function(state) {
    for(var i = 0; i < 16; i += 4) {
      var s0 = state[i + 0], s1 = state[i + 1];
      var s2 = state[i + 2], s3 = state[i + 3];
      var h = s0 ^ s1 ^ s2 ^ s3;
      var xh = this.xtime[h];
      var h1 = this.xtime[this.xtime[xh ^ s0 ^ s2]] ^ h;
      var h2 = this.xtime[this.xtime[xh ^ s1 ^ s3]] ^ h;
      state[i + 0] ^= h1 ^ this.xtime[s0 ^ s1];
      state[i + 1] ^= h2 ^ this.xtime[s1 ^ s2];
      state[i + 2] ^= h1 ^ this.xtime[s2 ^ s3];
      state[i + 3] ^= h2 ^ this.xtime[s3 ^ s0];
    }
  };
// xor the elements of two arrays together
  pidCrypt.AES.prototype.xOr_Array = function( a1, a2 ){
     var i;
     var res = Array();
     for( i=0; i<a1.length; i++ )
        res[i] = a1[i] ^ a2[i];

     return res;
  };
  pidCrypt.AES.prototype.getCounterBlock = function(){
    // initialise counter block (NIST SP800-38A §B.2): millisecond time-stamp for nonce in 1st 8 bytes,
    // block counter in 2nd 8 bytes
    var ctrBlk = new Array(this.blockSize);
    var nonce = (new Date()).getTime();  // timestamp: milliseconds since 1-Jan-1970
    var nonceSec = Math.floor(nonce/1000);
    var nonceMs = nonce%1000;
    // encode nonce with seconds in 1st 4 bytes, and (repeated) ms part filling 2nd 4 bytes
    for (var i=0; i<4; i++) ctrBlk[i] = (nonceSec >>> i*8) & 0xff;
    for (var i=0; i<4; i++) ctrBlk[i+4] = nonceMs & 0xff;
    
   return ctrBlk.slice();
  };
}


module.exports.pidCrypt = pidCrypt;
},{"./pidcrypt":9}],7:[function(require,module,exports){
 /*----------------------------------------------------------------------------*/
 // Copyright (c) 2009 pidder <www.pidder.com>
 // Permission to use, copy, modify, and/or distribute this software for any
 // purpose with or without fee is hereby granted, provided that the above
 // copyright notice and this permission notice appear in all copies.
 //
 // THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 // WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 // MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 // ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 // WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 // ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 // OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
/*----------------------------------------------------------------------------*/
/*
*  AES CTR (Counter) Mode for use in pidCrypt Library
*  The pidCrypt AES CTR is based on the implementation by Chris Veness 2005-2008.
*  See http://www.movable-type.co.uk/scripts/aes.html for details and for his
*  great job.
*
*  Depends on pidCrypt (pcrypt.js, pidcrypt_util.js), AES (aes_core.js)
/*----------------------------------------------------------------------------*/
/*  AES implementation in JavaScript (c) Chris Veness 2005-2008
* You are welcome to re-use these scripts [without any warranty express or
* implied] provided you retain my copyright notice and when possible a link to
* my website (under a LGPL license). §ection numbers relate the code back to
* sections in the standard.
/*----------------------------------------------------------------------------*/
var pidCrypt = require('./aes_core').pidCrypt;

if(typeof(pidCrypt) != 'undefined' && typeof(pidCrypt.AES) != 'undefined')
{
  pidCrypt.AES.CTR = function () {
    this.pidcrypt = new pidCrypt();
    this.aes = new  pidCrypt.AES(this.pidcrypt);
    //shortcuts to pidcrypt methods
    this.getOutput = function(){
      return this.pidcrypt.getOutput();
    };
    this.getAllMessages = function(lnbrk){
      return this.pidcrypt.getAllMessages(lnbrk);
    };
    this.isError = function(){
      return this.pidcrypt.isError();
    };
  };
/**
 * Initialize CTR for encryption from password.
 * @param  password: String
 * @param  options {
 *           nBits: aes bit size (128, 192 or 256)
 *         }
*/
  pidCrypt.AES.CTR.prototype.init = function(password, options) {
    if(!options) options = {};
    if(!password)
      this.pidcrypt.appendError('pidCrypt.AES.CTR.initFromEncryption: Sorry, can not crypt or decrypt without password.\n');
    this.pidcrypt.setDefaults();
    var pObj = this.pidcrypt.getParams(); //loading defaults
    for(var o in options)
      pObj[o] = options[o];
    pObj.password = password;
    pObj.key = password;
    pObj.dataOut = '';
    this.pidcrypt.setParams(pObj);
    this.aes.init();
  };

/**
* Init CTR Encryption from password.
* @param  dataIn: plain text
* @param  password: String
* @param  options {
*           nBits: aes bit size (128, 192 or 256)
*         }
*/
  pidCrypt.AES.CTR.prototype.initEncrypt = function(dataIn, password, options) {
    this.init(password, options);
    this.pidcrypt.setParams({dataIn:dataIn, encryptIn: pidCryptUtil.toByteArray(dataIn)});//setting input for encryption
 };
/**
* Init CTR for decryption from encrypted text (encrypted with pidCrypt.AES.CTR)
* @param  crypted: base64 encrypted text
* @param  password: String
* @param  options {
*           nBits: aes bit size (128, 192 or 256)
*         }
*/
  pidCrypt.AES.CTR.prototype.initDecrypt = function(crypted, password, options){
    var pObj = {};
    this.init(password, options);
    pObj.dataIn = crypted;
    var cipherText = pidCryptUtil.decodeBase64(crypted);
    // recover nonce from 1st 8 bytes of ciphertext
    var salt = cipherText.substr(0,8);//nonce in ctr
    pObj.salt = pidCryptUtil.convertToHex(salt);
    cipherText = cipherText.substr(8);
    pObj.decryptIn = pidCryptUtil.toByteArray(cipherText);
    this.pidcrypt.setParams(pObj);
  };

  pidCrypt.AES.CTR.prototype.getAllMessages = function(lnbrk){
    return this.pidcrypt.getAllMessages(lnbrk);
  };

  pidCrypt.AES.CTR.prototype.getCounterBlock = function(bs){
// initialise counter block (NIST SP800-38A §B.2): millisecond time-stamp for
// nonce in 1st 8 bytes, block counter in 2nd 8 bytes
    var ctrBlk = new Array(bs);
    var nonce = (new Date()).getTime();  // timestamp: milliseconds since 1-Jan-1970
    var nonceSec = Math.floor(nonce/1000);
    var nonceMs = nonce%1000;
    // encode nonce with seconds in 1st 4 bytes, and (repeated) ms part filling
    // 2nd 4 bytes
    for (var i=0; i<4; i++) ctrBlk[i] = (nonceSec >>> i*8) & 0xff;
    for (i=0; i<4; i++) ctrBlk[i+4] = nonceMs & 0xff;

    return ctrBlk.slice();
  };

/**
* Encrypt a text using AES encryption in CTR mode of operation
*  - see http://csrc.nist.gov/publications/nistpubs/800-38a/sp800-38a.pdf
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* @param  plaintext: text to encrypt
*
*
* @return          encrypted text
*/
  pidCrypt.AES.CTR.prototype.encryptRaw = function(byteArray) {
    var aes = this.aes;
    var pidcrypt = this.pidcrypt;
    var p = pidcrypt.getParams(); //get parameters for operation set by init
    if(!byteArray)
      byteArray = p.encryptIn;
    pidcrypt.setParams({encryptIn:byteArray});
    var password = p.key;
    // use AES itself to encrypt password to get cipher key (using plain
    // password as source for key expansion) - gives us well encrypted key
    var nBytes = Math.floor(p.nBits/8);  // no bytes in key
    var pwBytes = new Array(nBytes);
    for (var i=0; i<nBytes; i++)
      pwBytes[i] = isNaN(password.charCodeAt(i)) ? 0 : password.charCodeAt(i);
    var key = aes.encrypt(pwBytes.slice(0,16), aes.expandKey(pwBytes));  // gives us 16-byte key
    key = key.concat(key.slice(0, nBytes-16));  // expand key to 16/24/32 bytes long
    var counterBlock = this.getCounterBlock(p.blockSize);
    // and convert it to a string to go on the front of the ciphertext
    var ctrTxt = pidCryptUtil.byteArray2String(counterBlock.slice(0,8));
    pidcrypt.setParams({salt:pidCryptUtil.convertToHex(ctrTxt)});
    // generate key schedule - an expansion of the key into distinct Key Rounds
    // for each round
    var keySchedule = aes.expandKey(key);
    var blockCount = Math.ceil(byteArray.length/p.blockSize);
    var ciphertxt = new Array(blockCount);  // ciphertext as array of strings
    for (var b=0; b<blockCount; b++) {
    // set counter (block #) in last 8 bytes of counter block (leaving nonce in 1st 8 bytes)
    // done in two stages for 32-bit ops: using two words allows us to go past 2^32 blocks (68GB)
      for (var c=0; c<4; c++) counterBlock[15-c] = (b >>> c*8) & 0xff;
      for (var c=0; c<4; c++) counterBlock[15-c-4] = (b/0x100000000 >>> c*8);
      var cipherCntr = aes.encrypt(counterBlock, keySchedule);  // -- encrypt counter block --
      // block size is reduced on final block
      var blockLength = b<blockCount-1 ? p.blockSize : (byteArray.length-1)%p.blockSize+1;
      var cipherChar = new Array(blockLength);
      for (var i=0; i<blockLength; i++) {  // -- xor plaintext with ciphered counter char-by-char --
        cipherChar[i] = cipherCntr[i] ^ byteArray[b*p.blockSize+i];
        cipherChar[i] = String.fromCharCode(cipherChar[i]);
      }
      ciphertxt[b] = cipherChar.join('');
    };
//    alert(pidCryptUtil.encodeBase64(ciphertxt.join('')));
    // Array.join is more efficient than repeated string concatenation
    var ciphertext = ctrTxt + ciphertxt.join('');
    pidcrypt.setParams({dataOut:ciphertext, encryptOut:ciphertext});
    //remove all parameters from enviroment for more security is debug off
    if(!pidcrypt.isDebug() && pidcrypt.clear) pidcrypt.clearParams();
  return ciphertext;  
};

/**
* Encrypt a text using AES encryption in CTR mode of operation
*  - see http://csrc.nist.gov/publications/nistpubs/800-38a/sp800-38a.pdf
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* Unicode multi-byte character safe
*
*
* @param  plaintext: text to encrypt
*
*
* @return          encrypted text
*/
  pidCrypt.AES.CTR.prototype.encrypt = function(plaintext) {
    var pidcrypt = this.pidcrypt;
    var p = pidcrypt.getParams(); //get parameters for operation set by init
    if(!plaintext)
      plaintext = p.dataIn;
    if(p.UTF8){
      plaintext = pidCryptUtil.encodeUTF8(plaintext);
      pidcrypt.setParams({key:pidCryptUtil.encodeUTF8(pidcrypt.getParam('key'))});
    }
    pidcrypt.setParams({dataIn:plaintext, encryptIn: pidCryptUtil.toByteArray(plaintext)});
    var ciphertext = this.encryptRaw();
    ciphertext = pidCryptUtil.encodeBase64(ciphertext);  // encode in base64
    pidcrypt.setParams({dataOut:ciphertext});
    //remove all parameters from enviroment for more security is debug off
    if(!pidcrypt.isDebug() && pidcrypt.clear) pidcrypt.clearParams();

    return ciphertext;
  };

/**
* Encrypt a text using AES encryption in CTR mode of operation
*  - see http://csrc.nist.gov/publications/nistpubs/800-38a/sp800-38a.pdf
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* Unicode multi-byte character safe
*
* @param  dataIn: plain text
* @param  password: String
* @param  options {
*           nBits: aes bit size (128, 192 or 256)
*         }
*
* @return          encrypted text
*/
  pidCrypt.AES.CTR.prototype.encryptText = function(dataIn, password, options) {
   this.initEncrypt(dataIn, password, options);
   return this.encrypt();
 };


/**
* Decrypt a text encrypted by AES in CTR mode of operation
*
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* @param  ciphertext: text to decrypt
*
* @return           decrypted text as String
*/
  pidCrypt.AES.CTR.prototype.decryptRaw = function(byteArray) {
    var pidcrypt = this.pidcrypt;
    var aes = this.aes;
    var p = pidcrypt.getParams(); //get parameters for operation set by init
    if(!byteArray)
      byteArray = p.decryptIn;
    pidcrypt.setParams({decryptIn:byteArray});
    if(!p.dataIn) pidcrypt.setParams({dataIn:byteArray});
    // use AES to encrypt password (mirroring encrypt routine)
    var nBytes = Math.floor(p.nBits/8);  // no bytes in key
    var pwBytes = new Array(nBytes);
    for (var i=0; i<nBytes; i++) {
      pwBytes[i] = isNaN(p.key.charCodeAt(i)) ? 0 : p.key.charCodeAt(i);
    }
    var key = aes.encrypt(pwBytes.slice(0,16), aes.expandKey(pwBytes));  // gives us 16-byte key
    key = key.concat(key.slice(0, nBytes-16));  // expand key to 16/24/32 bytes long
    var counterBlock = new Array(8);
    var ctrTxt = pidCryptUtil.convertFromHex(p.salt);
    for (i=0; i<8; i++) counterBlock[i] = ctrTxt.charCodeAt(i);
    // generate key schedule
    var keySchedule =  aes.expandKey(key);
    // separate ciphertext into blocks (skipping past initial 8 bytes)
    var nBlocks = Math.ceil((byteArray.length) / p.blockSize);
    var blockArray = new Array(nBlocks);
    for (var b=0; b<nBlocks; b++) blockArray[b] = byteArray.slice(b*p.blockSize, b*p.blockSize+p.blockSize);
    // plaintext will get generated block-by-block into array of block-length
    // strings
    var plaintxt = new Array(blockArray.length);
    var cipherCntr = [];
    var plaintxtByte = [];
    for (b=0; b<nBlocks; b++) {
    // set counter (block #) in last 8 bytes of counter block (leaving nonce in 1st 8 bytes)
      for (var c=0; c<4; c++) counterBlock[15-c] = ((b) >>> c*8) & 0xff;
      for (c=0; c<4; c++) counterBlock[15-c-4] = (((b+1)/0x100000000-1) >>> c*8) & 0xff;
      cipherCntr = aes.encrypt(counterBlock, keySchedule);  // encrypt counter block
      plaintxtByte = new Array(blockArray[b].length);
      for (i=0; i<blockArray[b].length; i++) {
      // -- xor plaintxt with ciphered counter byte-by-byte --
        plaintxtByte[i] = cipherCntr[i] ^ blockArray[b][i];
        plaintxtByte[i] = String.fromCharCode(plaintxtByte[i]);
      }
      plaintxt[b] = plaintxtByte.join('');
    }
    // join array of blocks into single plaintext string
    var plaintext = plaintxt.join('');
    pidcrypt.setParams({dataOut:plaintext});
    //remove all parameters from enviroment for more security is debug off
    if(!pidcrypt.isDebug() && pidcrypt.clear) pidcrypt.clearParams();

    return plaintext;
  };
  
/**
* Decrypt a text encrypted by AES in CTR mode of operation
*
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* @param  ciphertext: text to decrypt
*
* @return  decrypted text as String
*/
  pidCrypt.AES.CTR.prototype.decrypt = function(ciphertext) {
    var pidcrypt = this.pidcrypt;
    var p = pidcrypt.getParams(); //get parameters for operation set by init
    if(ciphertext)
      pidcrypt.setParams({dataIn:ciphertext, decryptIn: pidCryptUtil.toByteArray(ciphertext)});
    if(p.UTF8){
      pidcrypt.setParams({key:pidCryptUtil.encodeUTF8(pidcrypt.getParam('key'))});
    }
    var plaintext = this.decryptRaw();
    plaintext = pidCryptUtil.decodeUTF8(plaintext);  // decode from UTF8 back to Unicode multi-byte chars

    pidcrypt.setParams({dataOut:plaintext});
    //remove all parameters from enviroment for more security is debug off
    if(!pidcrypt.isDebug() && pidcrypt.clear) pidcrypt.clearParams();

    return plaintext;
  };
/**
* Decrypt a text encrypted by AES in CTR mode of operation
*
* one of the pidCrypt.AES.CTR init funtions must be called before execution
*
* @param  crypted: base64 encrypted text
* @param  password: String
* @param  options {
*
* @return  decrypted text as String
*/
  pidCrypt.AES.CTR.prototype.decryptText = function(crypted, password, options) {
    this.initDecrypt(crypted, password, options);
    return this.decrypt();
  };


}

module.exports.pidCrypt = pidCrypt;

},{"./aes_core":6}],8:[function(require,module,exports){
var pidCrypt = require('./aes_ctr').pidCrypt;

var aes;
var pass;

function initializeEncryption (pw) {
  pass = pw;
  aes  = new pidCrypt.AES.CTR();
}

function encrypt(string) {
  if (aes) {
    aes.initEncrypt(string, pass, {nBits: 256});
    return JSON.stringify({"encrypted" : aes.encrypt()});
  } else {
    console.log("[ERROR] Encryption not initialized.");
    return "";
  }
}


function decrypt(encryptedPackage) {
  if (aes) {
    aes.initDecrypt(encryptedPackage.encrypted, pass, {nBits: 256});
    return aes.decrypt();
  } else {
    console.log("[ERROR] Encryption not initialized.");
    return "";
  }
}


module.exports.initializeEncryption = initializeEncryption;
module.exports.encrypt              = encrypt;
module.exports.decrypt              = decrypt;
},{"./aes_ctr":7}],9:[function(require,module,exports){
/*!Copyright (c) 2009 pidder <www.pidder.com>*/
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 2 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA
// 02111-1307 USA or check at http://www.gnu.org/licenses/gpl.html

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* pidCrypt is pidders JavaScript Crypto Library - www.pidder.com/pidcrypt
 * Version 0.04, 10/2009

 *
 * pidCrypt is a combination of different JavaScript functions for client side
 * encryption technologies with enhancements for openssl compatibility cast into
 * a modular class concept.
 *
 * Client side encryption is a must have for developing host proof applications:
 * There must be no knowledge of the clear text data at the server side, all
 * data is enrycpted prior to being submitted to the server.
 * Client side encryption is mandatory for protecting the privacy of the users.
 * "Dont't trust us, check our source code!"
 *
 * "As a cryptography and computer security expert, I have never understood
 * the current fuss about the open source software movement. In the
 * cryptography world, we consider open source necessary for good security;
 * we have for decades. Public security is always more secure than proprietary
 * security. It's true for cryptographic algorithms, security protocols, and
 * security source code. For us, open source isn't just a business model;
 * it's smart engineering practice."
 * Bruce Schneier, Crypto-Gram 1999/09/15
 * copied form keepassx site - keepassx is a cross plattform password manager
 *
 * pidCrypt comes with modules under different licenses and copyright terms.
 * Make sure that you read and respect the individual module license conditions
 * before using it.
 *
 * The pidCrypt base library contains:
 * 1. pidcrypt.js
 *    class pidCrypt: the base class of the library
 * 2. pidcrypt_util.js
 *    base64 en-/decoding as new methods of the JavaScript String class
 *    UTF8 en-/decoding as new methods of the JavaScript String class
 *    String/HexString conversions as new methods of the JavaScript String class
 *
 * The pidCrypt v0.01 modules and the original authors (see files for detailed
 * copyright and license terms) are:
 *
 * - md5.js:      MD5 (Message-Digest Algorithm), www.webtoolkit.info
 * - aes_core.js: AES (Advanced Encryption Standard ) Core algorithm, B. Poettering
 * - aes-ctr.js:  AES CTR (Counter) Mode, Chis Veness
 * - aes-cbc.js:  AES CBC (Cipher Block Chaining) Mode, pidder
 * - jsbn.js:     BigInteger for JavaScript, Tom Wu
 * - prng.js:     PRNG (Pseudo-Random Number Generator), Tom Wu
 * - rng.js:      Random Numbers, Tom Wu
 * - rsa.js:      RSA (Rivest, Shamir, Adleman Algorithm), Tom Wu
 * - oids.js:     oids (Object Identifiers found in ASN.1), Peter Gutmann
 * - asn1.js:     ASN1 (Abstract Syntax Notation One) parser, Lapo Luchini
 * - sha256.js    SHA-256 hashing, Angel Marin 
 * - sha2.js:     SHA-384 and SHA-512 hashing, Brian Turek
 *
 * IMPORTANT:
 * Please report any bugs at http://sourceforge.net/projects/pidcrypt/
 * Vist http://www.pidder.com/pidcrypt for online demo an documentation
 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
var pidCryptUtil = require('./pidcrypt_util').pidCryptUtil;

function pidCrypt(){
  //TODO: better radomness!
  function getRandomBytes(len){
    if(!len) len = 8;
    var bytes = new Array(len);
    var field = [];
    for(var i=0;i<256;i++) field[i] = i;
    for(i=0;i<bytes.length;i++)
      bytes[i] = field[Math.floor(Math.random()*field.length)];
    return bytes;
  }

  this.setDefaults = function(){
     this.params.nBits = 256;
  //salt should always be a Hex String e.g. AD0E76FF6535AD...
     this.params.salt = getRandomBytes(8);
     this.params.salt = pidCryptUtil.byteArray2String(this.params.salt);
     this.params.salt = pidCryptUtil.convertToHex(this.params.salt);
     this.params.blockSize = 16;
     this.params.UTF8 = true;
     this.params.A0_PAD = true;
  };

  this.debug = true;
  this.params = {};
  //setting default values for params
  this.params.dataIn = '';
  this.params.dataOut = '';
  this.params.decryptIn = '';
  this.params.decryptOut = '';
  this.params.encryptIn = '';
  this.params.encryptOut = '';
  //key should always be a Hex String e.g. AD0E76FF6535AD...
  this.params.key = '';
  //iv should always be a Hex String e.g. AD0E76FF6535AD...
  this.params.iv = '';
  this.params.clear = true;
  this.setDefaults();
  this.errors = '';
  this.warnings = '';
  this.infos = '';
  this.debugMsg = '';
  //set and get methods for base class
  this.setParams = function(pObj){
    if(!pObj) pObj = {};
    for(var p in pObj)
      this.params[p] = pObj[p];
  };
  this.getParams = function(){
    return this.params;
  };
  this.getParam = function(p){
    return this.params[p] || '';
  };
  this.clearParams = function(){
      this.params= {};
  };
  this.getNBits = function(){
    return this.params.nBits;
  };
  this.getOutput = function(){
    return this.params.dataOut;
  };
  this.setError = function(str){
    this.error = str;
  };
  this.appendError = function(str){
    this.errors += str;
    return '';
  };
  this.getErrors = function(){
    return this.errors;
  };
  this.isError = function(){
    if(this.errors.length>0)
      return true;
    return false;
  };
  this.appendInfo = function(str){
    this.infos += str;
    return '';
  };
  this.getInfos = function()
  {
    return this.infos;
  };
  this.setDebug = function(flag){
    this.debug = flag;
  };
  this.appendDebug = function(str)
  {
    this.debugMsg += str;
    return '';
  };
  this.isDebug = function(){
    return this.debug;
  };
  this.getAllMessages = function(options){
    var defaults = {lf:'\n',
                    clr_mes: false,
                    verbose: 15//verbose level bits = 1111
        };
    if(!options) options = defaults;
    for(var d in defaults)
      if(typeof(options[d]) == 'undefined') options[d] = defaults[d];
    var mes = '';
    var tmp = '';
    for(var p in this.params){
      switch(p){
        case 'encryptOut':
          tmp = pidCryptUtil.toByteArray(this.params[p].toString());
          tmp = pidCryptUtil.fragment(tmp.join(),64, options.lf);
          break;
        case 'key': 
        case 'iv':
          tmp = pidCryptUtil.formatHex(this.params[p],48);
          break;
        default:
          tmp = pidCryptUtil.fragment(this.params[p].toString(),64, options.lf);
      }  
      mes += '<p><b>'+p+'</b>:<pre>' + tmp + '</pre></p>';
    }  
    if(this.debug) mes += 'debug: ' + this.debug + options.lf;
    if(this.errors.length>0 && ((options.verbose & 1) == 1)) mes += 'Errors:' + options.lf + this.errors + options.lf;
    if(this.warnings.length>0 && ((options.verbose & 2) == 2)) mes += 'Warnings:' +options.lf + this.warnings + options.lf;
    if(this.infos.length>0 && ((options.verbose & 4) == 4)) mes += 'Infos:' +options.lf+ this.infos + options.lf;
    if(this.debug && ((options.verbose & 8) == 8)) mes += 'Debug messages:' +options.lf+ this.debugMsg + options.lf;
    if(options.clr_mes)
      this.errors = this.infos = this.warnings = this.debug = '';
    return mes;
 };
  this.getRandomBytes = function(len){
    return getRandomBytes(len);
  };
  //TODO warnings
}

module.exports.pidCrypt = pidCrypt;
},{"./pidcrypt_util":10}],10:[function(require,module,exports){
 /*----------------------------------------------------------------------------*/
 // Copyright (c) 2009 pidder <www.pidder.com>
 // Permission to use, copy, modify, and/or distribute this software for any
 // purpose with or without fee is hereby granted, provided that the above
 // copyright notice and this permission notice appear in all copies.
 //
 // THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 // WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 // MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 // ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 // WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 // ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 // OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
/*----------------------------------------------------------------------------*/
/*  (c) Chris Veness 2005-2008
* You are welcome to re-use these scripts [without any warranty express or
* implied] provided you retain my copyright notice and when possible a link to
* my website (under a LGPL license). §ection numbers relate the code back to
* sections in the standard.
/*----------------------------------------------------------------------------*/
/* Helper methods (base64 conversion etc.) needed for different operations in
 * encryption.

/*----------------------------------------------------------------------------*/
/* Intance methods extanding the String object                                */
/*----------------------------------------------------------------------------*/
/**
 * Encode string into Base64, as defined by RFC 4648 [http://tools.ietf.org/html/rfc4648]
 * As per RFC 4648, no newlines are added.
 *
 * @param utf8encode optional parameter, if set to true Unicode string is
 *                   encoded into UTF-8 before conversion to base64;
 *                   otherwise string is assumed to be 8-bit characters
 * @return coded     base64-encoded string
 */
pidCryptUtil = {};
pidCryptUtil.encodeBase64 = function(str,utf8encode) {  // http://tools.ietf.org/html/rfc4648
  if(!str) str = "";
  var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  utf8encode =  (typeof utf8encode == 'undefined') ? false : utf8encode;
  var o1, o2, o3, bits, h1, h2, h3, h4, e=[], pad = '', c, plain, coded;

  plain = utf8encode ? pidCryptUtil.encodeUTF8(str) : str;

  c = plain.length % 3;  // pad string to length of multiple of 3
  if (c > 0) { while (c++ < 3) { pad += '='; plain += '\0'; } }
  // note: doing padding here saves us doing special-case packing for trailing 1 or 2 chars

  for (c=0; c<plain.length; c+=3) {  // pack three octets into four hexets
    o1 = plain.charCodeAt(c);
    o2 = plain.charCodeAt(c+1);
    o3 = plain.charCodeAt(c+2);

    bits = o1<<16 | o2<<8 | o3;

    h1 = bits>>18 & 0x3f;
    h2 = bits>>12 & 0x3f;
    h3 = bits>>6 & 0x3f;
    h4 = bits & 0x3f;

    // use hextets to index into b64 string
    e[c/3] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
  };
  coded = e.join('');  // join() is far faster than repeated string concatenation

  // replace 'A's from padded nulls with '='s
  coded = coded.slice(0, coded.length-pad.length) + pad;
  return coded;
};

/**
 * Decode string from Base64, as defined by RFC 4648 [http://tools.ietf.org/html/rfc4648]
 * As per RFC 4648, newlines are not catered for.
 *
 * @param utf8decode optional parameter, if set to true UTF-8 string is decoded
 *                   back into Unicode after conversion from base64
 * @return           decoded string
 */
pidCryptUtil.decodeBase64 = function(str,utf8decode) {
  if(!str) str = "";
  var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  utf8decode =  (typeof utf8decode == 'undefined') ? false : utf8decode;
  var o1, o2, o3, h1, h2, h3, h4, bits, d=[], plain, coded;

  coded = utf8decode ? pidCryptUtil.decodeUTF8(str) : str;

  for (var c=0; c<coded.length; c+=4) {  // unpack four hexets into three octets
    h1 = b64.indexOf(coded.charAt(c));
    h2 = b64.indexOf(coded.charAt(c+1));
    h3 = b64.indexOf(coded.charAt(c+2));
    h4 = b64.indexOf(coded.charAt(c+3));

    bits = h1<<18 | h2<<12 | h3<<6 | h4;

    o1 = bits>>>16 & 0xff;
    o2 = bits>>>8 & 0xff;
    o3 = bits & 0xff;

    d[c/4] = String.fromCharCode(o1, o2, o3);
    // check for padding
    if (h4 == 0x40) d[c/4] = String.fromCharCode(o1, o2);
    if (h3 == 0x40) d[c/4] = String.fromCharCode(o1);
  }
  plain = d.join('');  // join() is far faster than repeated string concatenation

  plain = utf8decode ? pidCryptUtil.decodeUTF8(plain) : plain;

  return plain;
};

/**
 * Encode multi-byte Unicode string into utf-8 multiple single-byte characters
 * (BMP / basic multilingual plane only)
 *
 * Chars in range U+0080 - U+07FF are encoded in 2 chars, U+0800 - U+FFFF in 3 chars
 *
 * @return encoded string
 */
pidCryptUtil.encodeUTF8 = function(str) {
  if(!str) str = "";
  // use regular expressions & String.replace callback function for better efficiency
  // than procedural approaches
  str = str.replace(
      /[\u0080-\u07ff]/g,  // U+0080 - U+07FF => 2 bytes 110yyyyy, 10zzzzzz
      function(c) {
        var cc = c.charCodeAt(0);
        return String.fromCharCode(0xc0 | cc>>6, 0x80 | cc&0x3f); }
    );
  str = str.replace(
      /[\u0800-\uffff]/g,  // U+0800 - U+FFFF => 3 bytes 1110xxxx, 10yyyyyy, 10zzzzzz
      function(c) {
        var cc = c.charCodeAt(0);
        return String.fromCharCode(0xe0 | cc>>12, 0x80 | cc>>6&0x3F, 0x80 | cc&0x3f); }
    );
  return str;
};

// If you encounter problems with the UTF8 encode function (e.g. for use in a
// Firefox) AddOn) you can use the following instead.
// code from webtoolkit.com

//pidCryptUtil.encodeUTF8 = function(str) {
//		str = str.replace(/\r\n/g,"\n");
//		var utftext = "";
//
//		for (var n = 0; n < str.length; n++) {
//
//			var c = str.charCodeAt(n);
//
//			if (c < 128) {
//				utftext += String.fromCharCode(c);
//			}
//			else if((c > 127) && (c < 2048)) {
//				utftext += String.fromCharCode((c >> 6) | 192);
//				utftext += String.fromCharCode((c & 63) | 128);
//			}
//			else {
//				utftext += String.fromCharCode((c >> 12) | 224);
//				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
//				utftext += String.fromCharCode((c & 63) | 128);
//			}
//
//		}
//
//  return utftext;
//}



/**
 * Decode utf-8 encoded string back into multi-byte Unicode characters
 *
 * @return decoded string
 */
pidCryptUtil.decodeUTF8 = function(str) {
  if(!str) str = "";
  str = str.replace(
      /[\u00c0-\u00df][\u0080-\u00bf]/g,                 // 2-byte chars
      function(c) {  // (note parentheses for precence)
        var cc = (c.charCodeAt(0)&0x1f)<<6 | c.charCodeAt(1)&0x3f;
        return String.fromCharCode(cc); }
    );
  str = str.replace(
      /[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g,  // 3-byte chars
      function(c) {  // (note parentheses for precence)
        var cc = ((c.charCodeAt(0)&0x0f)<<12) | ((c.charCodeAt(1)&0x3f)<<6) | ( c.charCodeAt(2)&0x3f);
        return String.fromCharCode(cc); }
    );
  return str;
};

// If you encounter problems with the UTF8 decode function (e.g. for use in a
// Firefox) AddOn) you can use the following instead.
// code from webtoolkit.com

//pidCryptUtil.decodeUTF8 = function(utftext) {
//    var str = "";
//		var i = 0;
//		var c = 0;
//    var c1 = 0;
//    var c2 = 0;
//
//		while ( i < utftext.length ) {
//
//			c = utftext.charCodeAt(i);
//
//			if (c < 128) {
//				str += String.fromCharCode(c);
//				i++;
//			}
//			else if((c > 191) && (c < 224)) {
//				c1 = utftext.charCodeAt(i+1);
//				str += String.fromCharCode(((c & 31) << 6) | (c1 & 63));
//				i += 2;
//			}
//			else {
//				c1 = utftext.charCodeAt(i+1);
//				c2 = utftext.charCodeAt(i+2);
//				str += String.fromCharCode(((c & 15) << 12) | ((c1 & 63) << 6) | (c2 & 63));
//				i += 3;
//			}
//
//		}
//
//
//  return str;
//}




/**
 * Converts a string into a hexadecimal string
 * returns the characters of a string to their hexadecimal charcode equivalent
 * Works only on byte chars with charcode < 256. All others chars are converted
 * into "xx"
 *
 * @return hex string e.g. "hello world" => "68656c6c6f20776f726c64"
 */
pidCryptUtil.convertToHex = function(str) {
  if(!str) str = "";
  var hs ='';
  var hv ='';
  for (var i=0; i<str.length; i++) {
    hv = str.charCodeAt(i).toString(16);
    hs += (hv.length == 1) ? '0'+hv : hv;
  }
  return hs;
};

/**
 * Converts a hex string into a string
 * returns the characters of a hex string to their char of charcode
 *
 * @return hex string e.g. "68656c6c6f20776f726c64" => "hello world"
 */
pidCryptUtil.convertFromHex = function(str){
  if(!str) str = "";
  var s = "";
  for(var i= 0;i<str.length;i+=2){
    s += String.fromCharCode(parseInt(str.substring(i,i+2),16));
  }
  return s;
};

/**
 * strips off all linefeeds from a string
 * returns the the strong without line feeds
 *
 * @return string
 */
pidCryptUtil.stripLineFeeds = function(str){
  if(!str) str = "";
//  var re = RegExp(String.fromCharCode(13),'g');//\r
//  var re = RegExp(String.fromCharCode(10),'g');//\n
  var s = '';
  s = str.replace(/\n/g,'');
  s = s.replace(/\r/g,'');
  return s;
};

/**
 * Converts a string into an array of char code bytes
 * returns the characters of a hex string to their char of charcode
 *
 * @return hex string e.g. "68656c6c6f20776f726c64" => "hello world"
 */
 pidCryptUtil.toByteArray = function(str){
  if(!str) str = "";
  var ba = [];
  for(var i=0;i<str.length;i++)
     ba[i] = str.charCodeAt(i);

  return ba;
};


/**
 * Fragmentize a string into lines adding a line feed (lf) every length
 * characters
 *
 * @return string e.g. length=3 "abcdefghi" => "abc\ndef\nghi\n"
 */
pidCryptUtil.fragment = function(str,length,lf){
  if(!str) str = "";
  if(!length || length>=str.length) return str;
  if(!lf) lf = '\n';
  var tmp='';
  for(var i=0;i<str.length;i+=length)
    tmp += str.substr(i,length) + lf;
  return tmp;
};

/**
 * Formats a hex string in two lower case chars + : and lines of given length
 * characters
 *
 * @return string e.g. "68656C6C6F20" => "68:65:6c:6c:6f:20:\n"
*/
pidCryptUtil.formatHex = function(str,length){
  if(!str) str = "";
    if(!length) length = 45;
    var str_new='';
    var j = 0;
    var hex = str.toLowerCase();
    for(var i=0;i<hex.length;i+=2)
      str_new += hex.substr(i,2) +':';
    hex = this.fragment(str_new,length);

  return hex;
};


/*----------------------------------------------------------------------------*/
/* End of intance methods of the String object                                */
/*----------------------------------------------------------------------------*/

pidCryptUtil.byteArray2String = function(b){
//  var out ='';
  var s = '';
  for(var i=0;i<b.length;i++){
     s += String.fromCharCode(b[i]);
//     out += b[i]+':';
  }
//  alert(out);
  return s;
};

module.exports.pidCryptUtil = pidCryptUtil;
},{}],11:[function(require,module,exports){
var Future   = require('./future').Future;
var ObjectID = require('./objectID').ObjectID;


function FarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	/*******************************************************************
	 * Private in Object						     				   *
	 *******************************************************************/
	
	/*
	 * Serialization process of the proxy for the object. This serialized proxy
	 * behaviour is passed over the network when the object is distributed over
	 * the network.
	 */
	function serializeProxy() {
		var serializedFunctions = {};
		for(var key in self.proxy)
			serializedFunctions[key] = JSON.stringify(self.proxy[key], function(key, val) {
				return ((typeof val === "function") ? val+'' : val);
			});
		var serializedProxy = proxyHeading + "{";
		for (var key in serializedFunctions) {
			serializedProxy += "this." + key + " = ";
			if (serializedFunctions[key][0]=='"')
				serializedProxy += serializedFunctions[key].substring(1,serializedFunctions[key].length-1) + ";";
			else
				serializedProxy += serializedFunctions[key] + ";";
		}
		return serializedProxy + "}";
	};
	
	/*******************************************************************
	 * Public inside library					     				   *
	 *******************************************************************/
	//Return Object ID
	this.getObjectID = function() {
		return objectID;
	};
	
	//Set the proxy for the far reference
	this.setProxy = function(aProxy) {
		var serializedProxy = aProxy.serialize();
		proxyHeading = serializedProxy.substring(1,serializedProxy.indexOf('{'));
		aProxy.attachToReference(this.proxy);
	};
	
	//Call the onReceive behavior of the far reference
	this.onReceive = function(message) {
		this.proxy["onReceive"](message);
	};
	
	//Call the onPassReference behavior of the far reference
	this.onPassReference = function(reference) {
		this.proxy["onPassReference"](reference);
	};
	
	//Set the typetag with which the object is exported
	this.setTypeTag = function(tag) {
		typetag = tag;
	};
	
	//Get the typetag with which the object is exported
	this.getTypeTag = function(){
		return typetag;
	};

	//Serialize the far reference
	this.serialize = function() {
		var serializedProxy = proxyHeading ? serializeProxy() : null;
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : serializedProxy,
			referenceType : "by_reference",
			referenceTypeTag : typetag
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
}


// A reference pointing to a local object
function localFarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	/*******************************************************************
	 * Default behaviour for receiving messages and passing references *
	 * (can be overwritten by setProxy function)     				   *
	 *******************************************************************/
	this.proxy = {
		"onReceive" : function(message){
			if (!message || !message.type || !message.method || !message.arguments || !message.source)
				console.log("[ERROR] On invoke: missing properties of message");
			else {
				var serializedFutureID = message.futureID;
				var serializedObjectID = message.objectID;
				var future = self.asyncSend(message, message.type, message.timeout);
				//note: if the receiving client can not respond before timeout elapsed, the answer will not be sent anymore
				if ((message.type == "twoway") || (message.type == "due")) {
					future.whenBecomes(
						function(result) {
							receptionist.sendResponse(message.source, result, serializedObjectID, serializedFutureID);
						}, 
						function (exc) {
							console.log("[WARNING] Method invocation resulted in exception <" + exc + ">");
					});
					future.whenExpires(
						function(exc) {
							console.log("[WARNING] Asynchronous invocation on local object expired");
						}
					);
				};
			};
		} ,
		"onPassReference" : function(reference){}
	};

	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var object = receptionist.getObject(objectID);
		var result;
		
		if ((type == "oneway") || (type == "twoway") || (type == "due")) {
			var property = object[msg.method];
			var result = (typeof property == "function") ?
						 object[msg.method].apply(object, msg.arguments) :
						 object[msg.method];
			if (type == "twoway") {
				futureObject = new Future();
				futureObject.resolver.resolve(result);
				return futureObject.future;
			} else if (type == "due") {
				futureObject = new Future(timeout);
				futureObject.resolver.resolve(result);
				return futureObject.future;
			}
		} else
			console.log("[ERROR] Type of message: " + type + " is not known");
	};
	
	/*******************************************************************
	 * Public interface of local far references outside library        *
	 *******************************************************************/
	this.publicInterface = {
		"setProxy"	   : function(proxy) {self.setProxy(proxy);},
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "localFarReference"
	};
}


// A reference pointing to a local isolate
function localIsoFarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	//Inherit from localFarReference
	localFarReference.call(this, objectID, receptionist);

	function serializeProxy() {
		var serializedFunctions = {};
		for(var key in self.proxy)
			serializedFunctions[key] = JSON.stringify(self.proxy[key], function(key, val) {
				return ((typeof val === "function") ? val+'' : val);
			});
		var serializedProxy = proxyHeading + "{";
		for (var key in serializedFunctions) {
			serializedProxy += "this." + key + " = ";
			if (serializedFunctions[key][0]=='"')
				serializedProxy += serializedFunctions[key].substring(1,serializedFunctions[key].length-1) + ";";
			else
				serializedProxy += serializedFunctions[key] + ";";
		}
		return serializedProxy + "}";
	};
	
	// Indicate which operations mutate the object and require connection to
	// the original isolate
	function setMutableOperation(methodName){
		receptionist.addMutableOperation(objectID, methodName);
	}

	// Change the value of a property of an isolate, which results in the updates
	// being pushed to the remote versions of the isolate
	function setProperty(propertyName, propertyValue){
		receptionist.modifyIsolate(objectID, propertyName, propertyValue);
	}


	function setProxy (aProxy) {
		var serializedProxy = aProxy.serialize();
		proxyHeading = serializedProxy.substring(1,serializedProxy.indexOf('{'));
		aProxy.attachToReference(self.proxy);
		console.log("attached proxy...");
		console.log(proxyHeading);
	};

	//Serialize the isolate far reference (serialization process now includes list with mutating operations)
	this.serialize = function() {
		var serializedProxy = proxyHeading ? serializeProxy() : null;
		console.log("serializedProxy");
		console.log(serializedProxy);
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : serializedProxy,
			referenceType : "by_copy",
			referenceMutableList : receptionist.getMutableList(objectID),
			referenceTypeTag : this.getTypeTag()
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
	
	this.publicInterface.constructor  		 = "localIsoFarReference";
	this.publicInterface.setMutableOperation = setMutableOperation;
	this.publicInterface.setProperty 		 = setProperty;
	this.publicInterface.setProxy			 = setProxy;
}




// A reference pointing to a remote object
function remoteFarReference(objectID, receptionist) {
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	
	var self = this;
	// An outbox stores all messages sent to the remote
	// object when the remote object is not accessible
	var outbox = [];
	/*******************************************************************
	 * Default behaviour for receiving messages and passing references *
	 * (can be overwritten by setProxy function)     				   *
	 *******************************************************************/
	this.proxy = {
		"onReceive" : function(message){
			message.resolver.resolve(message.value);
		} ,
		"onPassReference" : function(reference){}
	};
	
	function sendMessage(message, objectID, futureID) {
		console.log("objectID in sendMessage in farReference.js : " + objectID);
		if (receptionist.checkAvailability(objectID)) {
			receptionist.sendMessage(message, objectID, futureID);
		} else {
			outbox.push({"message": message, "objectID": objectID, "futureID" : futureID});	
		}
	};
	
	this.getOutbox = function() {
		return outbox;
	};
		
	
	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var result;
		
		if (msg.messagetype == "asyncMessage") {
			msg.type = type;
			msg.timeout = timeout;
			
			if ((type == "oneway") || (type == "twoway") || (type == "due")) {
				if (type == "oneway") {
					console.log("In asyncSend, goint to send oneway message : " + objectID); // kdenk dat het futureObject.getObjectId() zou moeten zijn
					sendMessage(msg, objectID);	
				}	
				else {
					futureObject = (type == "due") ? new Future(timeout) : new Future();
					receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
					sendMessage(msg, objectID, futureObject.getObjectId());
					return futureObject.future;
				}
			} else
				console.log("[ERROR] Could not send message: invalid type <" + type + ">");
		} else
			console.log("[ERROR] Could not send message: invalid message construct");
	};
		
	
	/*******************************************************************
	 * Public interface of remote far references outside library       *
	 *******************************************************************/
	this.publicInterface = {
		"setProxy"	   : function(proxy) {self.setProxy(proxy);},
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "remoteFarReference"
	};
};


// A reference pointing to an isolate
function isolateFarReference(objectID, receptionist) {
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	
	var self = this;
	var outbox = [];
	var localObject = {};
	var mutableList = [];
	
	this.proxy = {
		"onReceive" : function(message){
			console.log("in isolateFarReference, message is : " + message.objectID);
			if (message.value && message.resolver){
				message.resolver.resolve(message.value);
			} else if (localObject[message.method] && (mutableList.indexOf(message.method) < 0)) {
				var property = localObject[message.method];
				var returnVal = (typeof property == "function") ? 
								property.apply(localObject, message.arguments) : property;
				var serializedObjectID = message.objectID.serialize();
				var serializedFutureID = message.futureID ? message.futureID.serialize() : null;
				receptionist.resolve(serializedObjectID, serializedFutureID, returnVal);
			} else if (receptionist.checkAvailability(message.objectID)) {
				receptionist.sendMessage(message, message.objectID, message.futureID);
				localObject = {};
			} else {
				outbox.push({"message": message, "objectID": message.objectID, "futureID" : message.futureID});	
			}
		} ,
		"onPassReference" : function(reference){}
	};
	
	this.setMutableList = function(list) {
		mutableList = list;
	};
	
	this.getOutbox = function() {
		return outbox;
	};
	
	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var result;
		
		if (msg.messagetype == "asyncMessage") {
			msg.type = type;
			msg.timeout = timeout;
			msg.objectID = objectID;
			console.log("in asyncSend of isolateFarReference (farreference.js), objectID is : " + msg.objectID);

			msg.arguments = msg.arguments.map(function(arg) {
				if ((typeof arg == "string") && (value.indexOf("referenceID")>-1)) {
					var passedReference = JSON.parse(value);
					var passedProxy = passedReference.referenceProxy;
					var passedTypeTag = passedReference.referenceTypeTag;
					if (passedProxy) {
						while (passedProxy.indexOf("\\t")>-1)
								passedProxy = passedProxy.replace("\\t", "\t");
						while (passedProxy.indexOf("\\n")>-1)
							passedProxy = passedProxy.replace("\\n", "\n");
						while (passedProxy.indexOf('\\"')>-1)
							passedProxy = passedProxy.replace('\\"', '\"');
						passedProxy = new Function("return " + passedProxy)();
						passedProxy = new ReferenceProxy(passedProxy);
					}
					var strategy    = passedReference.referenceType;
					var mutableList = passedReference.referenceMutableList;
					return receptionist.addDiscoveredObject(new ObjectID(JSON.stringify(passedReference.referenceID)), passedTypeTag, passedProxy, strategy, mutableList);
				} else
					return arg;
			});
			
			if ((type == "oneway") || (type == "twoway") || (type == "due")) {
				if (type == "oneway")
					this.proxy["onReceive"](msg);	
				else {
					futureObject = (type == "due") ? new Future(timeout) : new Future();
					msg.futureID = futureObject.getObjectId();
					receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
					this.proxy["onReceive"](msg);
					//If a mutable operation has been called remotely, the local copy of the isolate
					//has to be destroyed (to avoid intermediate read-outs) and updated
					futureObject.future.whenBecomes(function(response) {
						if (Object.keys(localObject).length == 0)
							self.updateObject();
					});
					return futureObject.future;
				}
			} else
				console.log("[ERROR] Could not send message: invalid type <" + type + ">");
		} else
			console.log("[ERROR] Could not send message: invalid message construct");
	};

	this.updateObject = function() {
		var futureObject = new Future(6000);
		receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
		
		console.log("in update object : " + objectID);
		if (receptionist.checkAvailability(objectID))
			receptionist.requestIsolateCopy(objectID, futureObject.getObjectId());
		else {
			var msg = {"messagetype":"isolateRequest", "objectID":objectID,"futureID":futureObject.getObjectId()};
			outbox.push({"message":msg, "objectID":msg.objectID, "futureID":msg.futureID});
		}
		
		futureObject.future.whenBecomes(function(isolateCopy){
			//reevaluate functions
			isolateCopy = new Function("return" + isolateCopy)();
			for (var key in isolateCopy) {
				var property = isolateCopy[key];
				if ((typeof property == "string") && (property.indexOf("function") == 0))
					isolateCopy[key] = new Function("return " + property)();
			}
			localObject = isolateCopy;
		});
		
		futureObject.future.whenExpires(function(exception){
			console.log("[ERROR] Failed to request copy of remote isolate");
		});
	};

	//Serialize the isolate far reference (serialization process now includes list with mutating operations)
	this.serialize = function() {
		var serializedProxy = null;
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : this.serializedProxy,
			referenceType : "by_copy",
			referenceMutableList : receptionist.getMutableList(objectID),
			referenceTypeTag : this.getTypeTag()
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
	
	/*******************************************************************
	 * Public interface of remote far references outside library       *
	 *******************************************************************/
	this.publicInterface = {
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "isolateFarReference"
	};
	
	this.updateObject();
}


module.exports.localFarReference    = localFarReference;
module.exports.localIsoFarReference = localIsoFarReference;
module.exports.remoteFarReference   = remoteFarReference;
module.exports.isolateFarReference  = isolateFarReference;
},{"./future":12,"./objectID":14}],12:[function(require,module,exports){
var ObjectID = require('./objectID').ObjectID;

function Future(timeout) {
	var self = this;
	var objectId = new ObjectID();
	var state = "UNRESOLVED";
	var resolvedValue = null;
	var subscribers = [];
	
	
	function addResolutionListener(subscriber) {
		switch (state) {
			case "RESOLVED" : subscriber.notifyResolved(resolvedValue); break;
			case "RUINED"   : subscriber.notifyRuined(resolvedValue); break;
			default    		: subscribers.push(subscriber); break; 
		};
		return null;
	}
	
	this.getObjectId = function() {
		return objectId;
	};
	
	this.future = {
		whenBecomes : function(resolvedBlock, exceptionBlock) {
							addResolutionListener({
								notifyResolved : function (val) {resolvedBlock(val);},
								notifyRuined   : function (exc) {if (exceptionBlock) exceptionBlock(exc);}
							});
		},
		whenExpires : function(exceptionBlock) {
							addResolutionListener({
								notifyResolved : function (val) {},
								notifyRuined   : function (exc) {
									if (exc == "EXPIRED") 
									exceptionBlock(exc);
								},
							});
		}
	};
	this.resolver = {
		resolve : function(val) {
					if (state == "UNRESOLVED") {
						state = "RESOLVED";
						resolvedValue = val;
						subscribers.forEach(function(subscriber) {
							subscriber.notifyResolved(val);
						});
					} else
						console.log("[WARNING] Future was already " + state.toLowerCase());
				  },
		ruin	: function(exc) {
					if (state == "UNRESOLVED") {
						state = "RUINED";
						resolvedValue = exc;
						subscribers.forEach(function(subscriber) {
							subscriber.notifyRuined(exc);
						});
					} else
						console.log("[WARNING] Future was already " + state.toLowerCase());
				  }
	};
	
	//Start timer of lease
	if (typeof timeout == "number")
		setTimeout(function(){self.resolver.ruin("EXPIRED");}, timeout);		
}

module.exports.Future = Future;
},{"./objectID":14}],13:[function(require,module,exports){
// AmbientJS Messenger app for Cordova :)

var AmbientJS = require('./AmbientJS');
AmbientJS.events.addListener('AmbientJS-Ready', function() {

	var myName;
	var buddyList = {};
	var reference;

	function addToLog(msg) {
		document.getElementById('receivedMessages').innerHTML += msg + "<br>";
	}

	function initializeMessenger(name) {
		myName = name;	
		AmbientJS.online();
		
		var remoteInterface = AmbientJS.createObject({
			"getName"   : function () {
				return myName;},
			"receiveMsg": function (msg) {
				addToLog(msg);}
		});

		AmbientJS.exportAs(remoteInterface, "MESSENGER");
		
		AmbientJS.wheneverDiscovered("MESSENGER", function(reference){
			var msg = AmbientJS.createMessage("getName", []);
			
			var future = reference.asyncSend(msg, "twoway");
			future.whenBecomes(function(reply) {
				buddyList[reply] = reference;
				addToLog(reply + " joined the conversation");
			});
			
		});
	}

		
	function broadcast(text){
		var msg = AmbientJS.createMessage('receiveMsg', [myName + ": " + text]);
		for(var buddy in buddyList) {
			buddyList[buddy].asyncSend(msg, "oneway");
		};
		addToLog(myName + ": " + text);
	}

	// Add behaviour for the GUI
	function init() {
		initializeMessenger(document.getElementById('name').value);
		document.getElementById('confirm').style.visibility = "hidden"; 
	}

	function broadcastIndirection() {
		broadcast(document.getElementById('msg').value);
	}

	document.getElementById('send').onclick    = broadcastIndirection;
	document.getElementById('confirm').onclick = init;

	// Show text fields and buttons now that AmbientJS is ready to be used
	document.getElementById('msg').style.visibility     = "visible";
	document.getElementById('send').style.visibility    = "visible";
});
},{"./AmbientJS":1}],14:[function(require,module,exports){
var util = require('./util');

/*A unique id generator creates an id that is unique for all
 *clients on the the network. It combines the IP-address of the
 *client with a unique counter.*/

function ObjectID(serializedInfo) {
	var address;
	var uniqueID;
	if (serializedInfo) {
		serializedInfo = JSON.parse(serializedInfo);
		address = serializedInfo.address;
		uniqueID = serializedInfo.uniqueID;
	} else {
		address = util.address.val;
		uniqueID = address + ":" + ObjectID.idCtr;
		ObjectID.idCtr++;
	}
	
	this.getId = function() {
		return uniqueID;
	};
	
	this.getHost = function(){
		return address;
	};
	
	this.isRemote = function() {
		return (util.address.val != address);
	};
	
	this.serialize = function() {
		return JSON.stringify({"address" : address, "uniqueID" : uniqueID});
	};
};

ObjectID.idCtr = 0;

module.exports.ObjectID = ObjectID;
},{"./util":17}],15:[function(require,module,exports){
function ReferenceProxy(behaviour) {
	// Give access to parent implementation of methods
	var resolvedBehaviour;
	var reference;
	
	function argumentCount(func) {
		return func.length;
	}
	
	function validate() {
		var valid = true;
		for (var method in resolvedBehaviour) {
			if ((typeof reference[method] == "function") && (typeof resolvedBehaviour[method] == "function")) {
				var argCtr1 = argumentCount(reference[method]);
				var argCtr2 = argumentCount(resolvedBehaviour[method]);
				if ((argCtr1>0) && (argCtr1 != argCtr2)) {
					console.log("[ERROR] Method " + method + " should take " + argCtr1 +
								" argument(s), instead it takes " + argCtr2 + " argument(s).");
					valid = false;
					break;
				}
			}
		}
		return valid;
	};
	
	function getFunction(func) {
		return resolvedBehaviour[func] ? resolvedBehaviour[func] : oldBehaviour[func];
	};
	
	
	this.serialize = function() {
		var x = JSON.stringify(behaviour, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		});

		return x;
	};

	
	this.attachToReference = function(aReference){
		var clonedReference = {};
		reference = aReference;
		for (var key in aReference)
			clonedReference[key] = aReference[key];
		//console.log(behaviour.toString());
		resolvedBehaviour = new behaviour(clonedReference);
		if (validate()) {
			for (var key in resolvedBehaviour) {
				reference[key] = resolvedBehaviour[key];
			}
			if (!reference.onReceive) reference.onReceive = oldBehaviour.onReceive;
			if (!reference.onPassReference) reference.onPassReference = oldBehaviour.onPassReference;
		} else 
			console.log("[ERROR] Failed to install new behaviour");
	};	
};

module.exports.ReferenceProxy = ReferenceProxy;
},{}],16:[function(require,module,exports){
var ObjectID 			 = require('./objectID').ObjectID;
var localFarReference 	 = require('./farReference').localFarReference;
var localIsoFarReference = require('./farReference').localIsoFarReference;
var remoteFarReference   = require('./farReference').remoteFarReference;
var isolateFarReference  = require('./farReference').isolateFarReference;
var ReferenceProxy 		 = require('./proxy').ReferenceProxy;

function Receptionist(connectionManager) {
	//maps id to local object
	var objectsTable   = {};
	//dictionary of near references to local objects (identified by id)
	var localFarReferences = {};
	//dictionary of near references to published local objects (identified by objectID, grouped by typetag)
	var publishedFarReferences = {};
	//dictionary of far references to discovered remote objects
	var remoteFarReferences = {};
	//collection of resolvers for pending futures
	var resolvers = {};
	//collection of mutable operations (array of methodnames, identified by objectID)
	var mutableOperations = {};
	//collection of registrations for each distributed isolate
	var isolateRegistrations = {};
	
	
	// Creation of sharable objects
	this.createObject = function(object) {
		//Add a unique global id to the object which can be distributed to other actors
		var objectID = new ObjectID();
		//Create a local far reference to the object
		var aLocalFarReference = new localFarReference(objectID, this);
		//Store the object
		objectsTable[objectID.getId()] = object;
		//Store the local far reference pointing to the object
		localFarReferences[objectID.getId()] = aLocalFarReference;
		return aLocalFarReference.publicInterface;
	};

	// Creation of a reference proxy
	this.createReferenceProxy = function(behaviour) {
		return new ReferenceProxy(behaviour);
	};
	
	// Creation of sharable objects (by copy)
	this.createIsolate = function(object) {
		//Add a unique global id to the object which can be distributed to other actors
		var objectID = new ObjectID();
		//Create a local far reference to the isolate
		var isolateFarReference = new localIsoFarReference(objectID, this);
		//Store the object
		objectsTable[objectID.getId()] = object;
		//Store the  far reference pointing to the isolate
		localFarReferences[objectID.getId()] = isolateFarReference;
		return isolateFarReference.publicInterface;
	};
	
	// Publication of a sharable object
	this.publishObject = function(farReference, typetag) {
		var objectID = farReference.getObjectID();
		if (!publishedFarReferences[typetag])
			publishedFarReferences[typetag] = [];
		publishedFarReferences[typetag].push(objectID);
		var reference = this.getRemoteFarReference(objectID);
		if (reference)
			reference.setTypeTag(typetag);
	};
	
	// Return collection of published objects
	this.getPublishedObjects = function() {
		return publishedFarReferences;
	};
	
	// Return reference to specific object
	this.getObjectReference = function(objectID) {
		var id = objectID.getId();
		if (localFarReferences[id])
			return localFarReferences[id];
		
		console.log("[ERROR] Receptionist did not find an object with id <" + id + ">");			
	};
	
	// Return collection of remote references
	this.getRemoteFarReferences = function(host) {
		var returnList = [];
		for (var typetag in remoteFarReferences){
			var list = remoteFarReferences[typetag];
			list.forEach(function(reference) {
				if (reference.getObjectID().getHost() == host);
					returnList.push(reference);
			});
		};
		return returnList;		
	};
	
	this.getRemoteFarReferencesTypeTag = function(typetag) {
		var list = remoteFarReferences[typetag];
		if (list)
			return list;
		else
			return [];
	};
	
	this.getRemoteFarReference = function(objectID) {
		var result;
		var host = objectID.getHost();
		for (var typetag in remoteFarReferences) {
			var list = remoteFarReferences[typetag];
			list.forEach(function(reference){
				if (reference.getObjectID().getId() == objectID.getId()) {
					result = reference;
				}
			});
			if (result)
				break;
		}
		return result;
	};
	
	// Discover an object shared by another client
	this.addDiscoveredObject = function(objectID, typetag, proxy, strategy, mutableList) {
		//Create a reference to the remote object
		var aReference;
		if (strategy == "by_reference")
			aReference = new remoteFarReference(objectID, this);
		else {
			aReference = new isolateFarReference(objectID, this);
			aReference.setMutableList(mutableList);
		}
		//Store the reference
		if (remoteFarReferences[typetag])
			remoteFarReferences[typetag].push(aReference);
		else
			remoteFarReferences[typetag] = [aReference];
		//Install a proxy on the reference
		if (proxy)
			aReference.setProxy(proxy);
		//Set the typetag of the reference
		aReference.setTypeTag(typetag);
		//Return the public interface of the reference	
		return aReference.publicInterface;
	};
	
	// Get the internally stored, sharable object based on its objectID
	this.getObject = function(objectID) {
		if (!objectID.isRemote())
			//Resolved object is a local object
			return objectsTable[objectID.getId()];
	};
	
	// Send a message to a discovered object shared by another client
	this.sendMessage = function(msg, objectID, futureID) {
		connectionManager.sendMessage(msg, objectID, futureID);
	};
	
	// Send a response to a discovered object shared by another client
	this.sendResponse = function(sourceSocket, result, serializedObjectID, serializedFutureID) {
		connectionManager.sendResponse(sourceSocket, result, serializedObjectID, serializedFutureID);
	};
	
	// Send a request for the local copy of a received isolate
	this.requestIsolateCopy = function(objectID, futureID) {
		connectionManager.requestIsolateCopy(objectID, futureID);
	};
	
	// Check if the socket connection handling messages for the remote object
	// is already usable
	this.checkAvailability = function(objectID) {
		if(typeof(objectID) == 'undefined')
			return false;
		
		return connectionManager.checkAvailability(objectID.getHost());
	};
	
	// Store the resolver of a future being the result of a message send
	// to a remote object. Once an answer from the remote object is received,
	// the future will be resolved. 
	this.addResolver = function(futureID, resolver) {
		resolvers[futureID.serialize()] = resolver;
	};
	
	
	
	// Resolve a resolver stored when an answer is received after a method
	// invocation of a remote object
	this.resolve = function(serializedObjectID, serializedFutureID, value) {
		var resolver = resolvers[serializedFutureID];
		if (resolver) {
			//returned value was a serialized far reference; create new far reference
			//(value contains s_id, s_onReceive and s_onPassReference)
			//console.log("check");
			//console.log(value);
			if (value && (typeof value == "string") && (value.indexOf("referenceID")>-1)) {
				var passedReference = JSON.parse(value);
				var passedProxy = passedReference.referenceProxy;
				var passedTypeTag = passedReference.referenceTypeTag;
				if (passedProxy) {
					while (passedProxy.indexOf("\\t")>-1)
							passedProxy = passedProxy.replace("\\t", "\t");
					while (passedProxy.indexOf("\\n")>-1)
						passedProxy = passedProxy.replace("\\n", "\n");
					while (passedProxy.indexOf('\\"')>-1)
						passedProxy = passedProxy.replace('\\"', '\"');
					passedProxy = new Function("return " + passedProxy)();
					passedProxy = new ReferenceProxy(passedProxy);
				}
				var strategy    = passedReference.referenceType;
				var mutableList = passedReference.referenceMutableList;	
				value = this.addDiscoveredObject(new ObjectID(JSON.stringify(passedReference.referenceID)), passedTypeTag, passedProxy, strategy, mutableList);
			}
			//call the onReceive of the remote far reference
			var ref = this.getRemoteFarReference(new ObjectID(serializedObjectID));
			//Check onReceive of ref!
			//console.log(JSON.stringify(ref.onReceive));
			ref.onReceive({"value":value, "resolver":resolver});
		} else
			console.log("[ERROR] Did not find resolver of future <" + serializedFutureID + ">");
	};
	
	// Identify one of the operations of an isolate as a mutable operation
	this.addMutableOperation = function(objectID, methodName){
		var object = this.getObject(objectID);
		if (object[methodName]) {
			if (mutableOperations[objectID])
				mutableOperations[objectID].push(methodName);
			else
				mutableOperations[objectID] = [methodName];
		} else
			console.log("[ERROR] Method " + methodName + " not found in the object");
	};
	
	// Get the list of all mutable operations of an isolate
	this.getMutableList = function(objectID) {
		if (mutableOperations[objectID.getId()])
			return mutableOperations[objectID.getId()];
		else
			return [];
	};


	// Modifiy the value of a property of an object
	this.modifyIsolate = function(objectID, name, value) {
		if(!objectID.isRemote()) {
			var registrations = this.getIsolateRegistrations(objectID);
			objectsTable[objectID.getId()][name] = value;

			console.log("modifying isolate for:");
			registrations.forEach(function(host){
				console.log(host);
				connectionManager.sendIsolateUpdate(host, objectID);
			});
		}
	};

	// Register a client for a specific isolate object (i.e. the client holds a copy of the isolate)
	this.registerForIsolate = function(objectID, hostName) {
		if(isolateRegistrations[objectID])
			isolateRegistrations[objectID.getId()].push(hostName);
		else
			isolateRegistrations[objectID.getId()] = [hostName];
	};

	// Get the list of hosts that are registered for a specific isolate
	this.getIsolateRegistrations = function(objectID) {
		var registrations = isolateRegistrations[objectID.getId()];
		if (registrations)
			return registrations;
		else
			return [];
	};
}

module.exports.Receptionist = Receptionist;
},{"./farReference":11,"./objectID":14,"./proxy":15}],17:[function(require,module,exports){
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
},{"./Plugins/Cordova/cordovaPlugin":2,"./encryption/encryption":8,"net":19,"vub.ac.be.nsdmodule":undefined}],18:[function(require,module,exports){
/*!
 * EventEmitter v4.2.11 - git.io/ee
 * Unlicense - http://unlicense.org/
 * Oliver Caldwell - http://oli.me.uk/
 * @preserve
 */

;(function () {
    'use strict';

    /**
     * Class for managing events.
     * Can be extended to provide event functionality in other classes.
     *
     * @class EventEmitter Manages event registering and emitting.
     */
    function EventEmitter() {}

    // Shortcuts to improve speed and size
    var proto = EventEmitter.prototype;
    var exports = this;
    var originalGlobalValue = exports.EventEmitter;

    /**
     * Finds the index of the listener for the event in its storage array.
     *
     * @param {Function[]} listeners Array of listeners to search through.
     * @param {Function} listener Method to look for.
     * @return {Number} Index of the specified listener, -1 if not found
     * @api private
     */
    function indexOfListener(listeners, listener) {
        var i = listeners.length;
        while (i--) {
            if (listeners[i].listener === listener) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Alias a method while keeping the context correct, to allow for overwriting of target method.
     *
     * @param {String} name The name of the target method.
     * @return {Function} The aliased method
     * @api private
     */
    function alias(name) {
        return function aliasClosure() {
            return this[name].apply(this, arguments);
        };
    }

    /**
     * Returns the listener array for the specified event.
     * Will initialise the event object and listener arrays if required.
     * Will return an object if you use a regex search. The object contains keys for each matched event. So /ba[rz]/ might return an object containing bar and baz. But only if you have either defined them with defineEvent or added some listeners to them.
     * Each property in the object response is an array of listener functions.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Function[]|Object} All listener functions for the event.
     */
    proto.getListeners = function getListeners(evt) {
        var events = this._getEvents();
        var response;
        var key;

        // Return a concatenated array of all matching events if
        // the selector is a regular expression.
        if (evt instanceof RegExp) {
            response = {};
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    response[key] = events[key];
                }
            }
        }
        else {
            response = events[evt] || (events[evt] = []);
        }

        return response;
    };

    /**
     * Takes a list of listener objects and flattens it into a list of listener functions.
     *
     * @param {Object[]} listeners Raw listener objects.
     * @return {Function[]} Just the listener functions.
     */
    proto.flattenListeners = function flattenListeners(listeners) {
        var flatListeners = [];
        var i;

        for (i = 0; i < listeners.length; i += 1) {
            flatListeners.push(listeners[i].listener);
        }

        return flatListeners;
    };

    /**
     * Fetches the requested listeners via getListeners but will always return the results inside an object. This is mainly for internal use but others may find it useful.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Object} All listener functions for an event in an object.
     */
    proto.getListenersAsObject = function getListenersAsObject(evt) {
        var listeners = this.getListeners(evt);
        var response;

        if (listeners instanceof Array) {
            response = {};
            response[evt] = listeners;
        }

        return response || listeners;
    };

    /**
     * Adds a listener function to the specified event.
     * The listener will not be added if it is a duplicate.
     * If the listener returns true then it will be removed after it is called.
     * If you pass a regular expression as the event name then the listener will be added to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListener = function addListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var listenerIsWrapped = typeof listener === 'object';
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key) && indexOfListener(listeners[key], listener) === -1) {
                listeners[key].push(listenerIsWrapped ? listener : {
                    listener: listener,
                    once: false
                });
            }
        }

        return this;
    };

    /**
     * Alias of addListener
     */
    proto.on = alias('addListener');

    /**
     * Semi-alias of addListener. It will add a listener that will be
     * automatically removed after its first execution.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addOnceListener = function addOnceListener(evt, listener) {
        return this.addListener(evt, {
            listener: listener,
            once: true
        });
    };

    /**
     * Alias of addOnceListener.
     */
    proto.once = alias('addOnceListener');

    /**
     * Defines an event name. This is required if you want to use a regex to add a listener to multiple events at once. If you don't do this then how do you expect it to know what event to add to? Should it just add to every possible match for a regex? No. That is scary and bad.
     * You need to tell it what event names should be matched by a regex.
     *
     * @param {String} evt Name of the event to create.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvent = function defineEvent(evt) {
        this.getListeners(evt);
        return this;
    };

    /**
     * Uses defineEvent to define multiple events.
     *
     * @param {String[]} evts An array of event names to define.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvents = function defineEvents(evts) {
        for (var i = 0; i < evts.length; i += 1) {
            this.defineEvent(evts[i]);
        }
        return this;
    };

    /**
     * Removes a listener function from the specified event.
     * When passed a regular expression as the event name, it will remove the listener from all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to remove the listener from.
     * @param {Function} listener Method to remove from the event.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListener = function removeListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var index;
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key)) {
                index = indexOfListener(listeners[key], listener);

                if (index !== -1) {
                    listeners[key].splice(index, 1);
                }
            }
        }

        return this;
    };

    /**
     * Alias of removeListener
     */
    proto.off = alias('removeListener');

    /**
     * Adds listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can add to multiple events at once. The object should contain key value pairs of events and listeners or listener arrays. You can also pass it an event name and an array of listeners to be added.
     * You can also pass it a regular expression to add the array of listeners to all events that match it.
     * Yeah, this function does quite a bit. That's probably a bad thing.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add to multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListeners = function addListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(false, evt, listeners);
    };

    /**
     * Removes listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be removed.
     * You can also pass it a regular expression to remove the listeners from all events that match it.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListeners = function removeListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(true, evt, listeners);
    };

    /**
     * Edits listeners in bulk. The addListeners and removeListeners methods both use this to do their job. You should really use those instead, this is a little lower level.
     * The first argument will determine if the listeners are removed (true) or added (false).
     * If you pass an object as the second argument you can add/remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be added/removed.
     * You can also pass it a regular expression to manipulate the listeners of all events that match it.
     *
     * @param {Boolean} remove True if you want to remove listeners, false if you want to add.
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add/remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add/remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.manipulateListeners = function manipulateListeners(remove, evt, listeners) {
        var i;
        var value;
        var single = remove ? this.removeListener : this.addListener;
        var multiple = remove ? this.removeListeners : this.addListeners;

        // If evt is an object then pass each of its properties to this method
        if (typeof evt === 'object' && !(evt instanceof RegExp)) {
            for (i in evt) {
                if (evt.hasOwnProperty(i) && (value = evt[i])) {
                    // Pass the single listener straight through to the singular method
                    if (typeof value === 'function') {
                        single.call(this, i, value);
                    }
                    else {
                        // Otherwise pass back to the multiple function
                        multiple.call(this, i, value);
                    }
                }
            }
        }
        else {
            // So evt must be a string
            // And listeners must be an array of listeners
            // Loop over it and pass each one to the multiple method
            i = listeners.length;
            while (i--) {
                single.call(this, evt, listeners[i]);
            }
        }

        return this;
    };

    /**
     * Removes all listeners from a specified event.
     * If you do not specify an event then all listeners will be removed.
     * That means every event will be emptied.
     * You can also pass a regex to remove all events that match it.
     *
     * @param {String|RegExp} [evt] Optional name of the event to remove all listeners for. Will remove from every event if not passed.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeEvent = function removeEvent(evt) {
        var type = typeof evt;
        var events = this._getEvents();
        var key;

        // Remove different things depending on the state of evt
        if (type === 'string') {
            // Remove all listeners for the specified event
            delete events[evt];
        }
        else if (evt instanceof RegExp) {
            // Remove all events matching the regex.
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    delete events[key];
                }
            }
        }
        else {
            // Remove all listeners in all events
            delete this._events;
        }

        return this;
    };

    /**
     * Alias of removeEvent.
     *
     * Added to mirror the node API.
     */
    proto.removeAllListeners = alias('removeEvent');

    /**
     * Emits an event of your choice.
     * When emitted, every listener attached to that event will be executed.
     * If you pass the optional argument array then those arguments will be passed to every listener upon execution.
     * Because it uses `apply`, your array of arguments will be passed as if you wrote them out separately.
     * So they will not arrive within the array on the other side, they will be separate.
     * You can also pass a regular expression to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {Array} [args] Optional array of arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emitEvent = function emitEvent(evt, args) {
        var listenersMap = this.getListenersAsObject(evt);
        var listeners;
        var listener;
        var i;
        var key;
        var response;

        for (key in listenersMap) {
            if (listenersMap.hasOwnProperty(key)) {
                listeners = listenersMap[key].slice(0);
                i = listeners.length;

                while (i--) {
                    // If the listener returns true then it shall be removed from the event
                    // The function is executed either with a basic call or an apply if there is an args array
                    listener = listeners[i];

                    if (listener.once === true) {
                        this.removeListener(evt, listener.listener);
                    }

                    response = listener.listener.apply(this, args || []);

                    if (response === this._getOnceReturnValue()) {
                        this.removeListener(evt, listener.listener);
                    }
                }
            }
        }

        return this;
    };

    /**
     * Alias of emitEvent
     */
    proto.trigger = alias('emitEvent');

    /**
     * Subtly different from emitEvent in that it will pass its arguments on to the listeners, as opposed to taking a single array of arguments to pass on.
     * As with emitEvent, you can pass a regex in place of the event name to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {...*} Optional additional arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emit = function emit(evt) {
        var args = Array.prototype.slice.call(arguments, 1);
        return this.emitEvent(evt, args);
    };

    /**
     * Sets the current value to check against when executing listeners. If a
     * listeners return value matches the one set here then it will be removed
     * after execution. This value defaults to true.
     *
     * @param {*} value The new value to check for when executing listeners.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.setOnceReturnValue = function setOnceReturnValue(value) {
        this._onceReturnValue = value;
        return this;
    };

    /**
     * Fetches the current value to check against when executing listeners. If
     * the listeners return value matches this one then it should be removed
     * automatically. It will return true by default.
     *
     * @return {*|Boolean} The current value to check for or the default, true.
     * @api private
     */
    proto._getOnceReturnValue = function _getOnceReturnValue() {
        if (this.hasOwnProperty('_onceReturnValue')) {
            return this._onceReturnValue;
        }
        else {
            return true;
        }
    };

    /**
     * Fetches the events object and creates one if required.
     *
     * @return {Object} The events storage object.
     * @api private
     */
    proto._getEvents = function _getEvents() {
        return this._events || (this._events = {});
    };

    /**
     * Reverts the global {@link EventEmitter} to its previous value and returns a reference to this version.
     *
     * @return {Function} Non conflicting EventEmitter class.
     */
    EventEmitter.noConflict = function noConflict() {
        exports.EventEmitter = originalGlobalValue;
        return EventEmitter;
    };

    // Expose the class either via AMD, CommonJS or the global object
    if (typeof define === 'function' && define.amd) {
        define(function () {
            return EventEmitter;
        });
    }
    else if (typeof module === 'object' && module.exports){
        module.exports = EventEmitter;
    }
    else {
        exports.EventEmitter = EventEmitter;
    }
}.call(this));

},{}],19:[function(require,module,exports){

},{}]},{},[13]);
