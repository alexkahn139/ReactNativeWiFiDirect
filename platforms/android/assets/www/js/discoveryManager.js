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