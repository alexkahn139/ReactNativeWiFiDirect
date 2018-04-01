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
				 * WebRTC is still an experimental technology. Setting up a socket can take some time (due to handhsake information beind exchanged via ZeroConf)
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