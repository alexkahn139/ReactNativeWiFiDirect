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